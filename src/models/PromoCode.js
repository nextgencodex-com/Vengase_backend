const { getFirestore } = require('../../config/firebase');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class PromoCode {
  constructor() {
    this.collection = 'promoCodes';
  }

  normalizeCode(code = '') {
    return String(code || '').trim().toUpperCase();
  }

  sanitizeNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : fallback;
    }

    const sanitized = String(value)
      .replace(/,/g, '')
      .replace(/[^0-9.-]/g, '');
    const num = Number(sanitized);
    return Number.isFinite(num) ? num : fallback;
  }

  sanitizeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  formatDocument(payload = {}, existing = null) {
    const code = this.normalizeCode(payload.code || existing?.code || '');

    return {
      code,
      description: String(payload.description ?? existing?.description ?? '').trim(),
      discountType: payload.discountType || existing?.discountType || 'percentage',
      discountValue: this.sanitizeNumber(payload.discountValue, existing?.discountValue ?? 0),
      minOrderAmount: this.sanitizeNumber(payload.minOrderAmount, existing?.minOrderAmount ?? 0),
      maxDiscountAmount: payload.maxDiscountAmount === null || payload.maxDiscountAmount === ''
        ? null
        : this.sanitizeNumber(payload.maxDiscountAmount, existing?.maxDiscountAmount ?? 0),
      usageLimit: payload.usageLimit === null || payload.usageLimit === ''
        ? null
        : this.sanitizeNumber(payload.usageLimit, existing?.usageLimit ?? 0),
      usedCount: this.sanitizeNumber(existing?.usedCount, 0),
      isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : Boolean(existing?.isActive ?? true),
      startsAt: payload.startsAt !== undefined ? this.sanitizeDate(payload.startsAt) : (existing?.startsAt || null),
      expiresAt: payload.expiresAt !== undefined ? this.sanitizeDate(payload.expiresAt) : (existing?.expiresAt || null),
      updatedAt: new Date()
    };
  }

  validateDefinition(promoData) {
    if (!promoData.code) {
      throw new Error('Promo code is required');
    }

    if (!['percentage', 'fixed'].includes(promoData.discountType)) {
      throw new Error('Discount type must be percentage or fixed');
    }

    if (promoData.discountValue <= 0) {
      throw new Error('Discount value must be greater than zero');
    }

    if (promoData.discountType === 'percentage' && promoData.discountValue > 100) {
      throw new Error('Percentage discount cannot exceed 100');
    }

    if (promoData.minOrderAmount < 0) {
      throw new Error('Minimum order amount cannot be negative');
    }

    if (promoData.maxDiscountAmount !== null && promoData.maxDiscountAmount < 0) {
      throw new Error('Max discount amount cannot be negative');
    }

    if (promoData.usageLimit !== null && promoData.usageLimit < 1) {
      throw new Error('Usage limit must be at least 1');
    }

    if (promoData.startsAt && promoData.expiresAt && promoData.startsAt > promoData.expiresAt) {
      throw new Error('Start date cannot be later than expiry date');
    }
  }

  async create(promoData, createdBy = {}) {
    try {
      const db = getFirestore();
      const id = uuidv4();
      const promoRef = db.collection(this.collection).doc(id);
      const normalizedPromo = this.formatDocument(promoData);

      this.validateDefinition(normalizedPromo);

      const existing = await this.findByCode(normalizedPromo.code);
      if (existing) {
        throw new Error('Promo code already exists');
      }

      const now = new Date();
      const document = {
        id,
        ...normalizedPromo,
        usedCount: 0,
        createdBy: {
          uid: createdBy.uid || null,
          email: createdBy.email || null
        },
        createdAt: now,
        updatedAt: now
      };

      await promoRef.set(document);
      logger.info(`Promo code created: ${document.code}`);
      return document;
    } catch (error) {
      logger.error('Error creating promo code:', error);
      throw error;
    }
  }

  async findAll() {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(this.collection).get();
      const promoCodes = [];

      snapshot.forEach((doc) => {
        promoCodes.push(doc.data());
      });

      promoCodes.sort((a, b) => {
        const aTime = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const bTime = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });

      return promoCodes;
    } catch (error) {
      logger.error('Error finding promo codes:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      const db = getFirestore();
      const doc = await db.collection(this.collection).doc(id).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      logger.error('Error finding promo code by ID:', error);
      throw error;
    }
  }

  async findByCode(code) {
    try {
      const normalized = this.normalizeCode(code);
      if (!normalized) return null;

      const db = getFirestore();
      const snapshot = await db.collection(this.collection)
        .where('code', '==', normalized)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        return snapshot.docs[0].data();
      }

      // Backward compatibility for existing documents that may store code in
      // inconsistent casing or with surrounding spaces.
      const allSnapshot = await db.collection(this.collection).get();
      const fallbackDoc = allSnapshot.docs.find((doc) => {
        const data = doc.data() || {};
        return this.normalizeCode(data.code) === normalized;
      });

      return fallbackDoc ? fallbackDoc.data() : null;
    } catch (error) {
      logger.error('Error finding promo code by code:', error);
      throw error;
    }
  }

  calculateDiscount(promo, orderAmount) {
    if (promo.discountType === 'fixed') {
      return Math.min(promo.discountValue, orderAmount);
    }

    const raw = (orderAmount * promo.discountValue) / 100;
    if (promo.maxDiscountAmount && promo.maxDiscountAmount > 0) {
      return Math.min(raw, promo.maxDiscountAmount);
    }

    return raw;
  }

  async validateCode(code, orderAmount) {
    const promo = await this.findByCode(code);

    if (!promo) {
      return { valid: false, message: 'Promo code not found' };
    }

    const hasExplicitActive = promo.isActive !== undefined && promo.isActive !== null;
    const isActive = hasExplicitActive
      ? (typeof promo.isActive === 'string'
        ? promo.isActive.toLowerCase() === 'true'
        : Boolean(promo.isActive))
      : (String(promo.status || '').toLowerCase() !== 'inactive');

    if (!isActive) {
      return { valid: false, message: 'Promo code is inactive' };
    }

    const now = new Date();
    const startsAt = promo.startsAt?.toDate ? promo.startsAt.toDate() : (promo.startsAt ? new Date(promo.startsAt) : null);
    const expiresAt = promo.expiresAt?.toDate ? promo.expiresAt.toDate() : (promo.expiresAt ? new Date(promo.expiresAt) : null);

    if (startsAt && startsAt > now) {
      return { valid: false, message: 'Promo code is not active yet' };
    }

    if (expiresAt && expiresAt < now) {
      return { valid: false, message: 'Promo code has expired' };
    }

    const usageLimitValue = this.sanitizeNumber(
      promo.usageLimit ?? promo.maxUses ?? promo.limit,
      0
    );
    const usageLimit = usageLimitValue > 0 ? usageLimitValue : null;
    const usedCount = this.sanitizeNumber(promo.usedCount ?? promo.usageCount, 0);

    if (usageLimit !== null && usedCount >= usageLimit) {
      return { valid: false, message: 'Promo code usage limit reached' };
    }

    const sanitizedAmount = this.sanitizeNumber(orderAmount, 0);
    const minOrderAmount = this.sanitizeNumber(
      promo.minOrderAmount ?? promo.minimumOrderAmount ?? promo.minAmount,
      0
    );
    if (sanitizedAmount < minOrderAmount) {
      return {
        valid: false,
        message: `Minimum order amount is Rs ${minOrderAmount.toFixed(2)}`
      };
    }

    const normalizedPromo = {
      ...promo,
      discountType: String(promo.discountType || promo.type || 'percentage').toLowerCase().trim(),
      discountValue: this.sanitizeNumber(promo.discountValue ?? promo.value ?? promo.discount, 0),
      maxDiscountAmount: this.sanitizeNumber(
        promo.maxDiscountAmount ?? promo.maxDiscount ?? promo.discountCap,
        0
      )
    };

    const discountAmount = this.calculateDiscount(normalizedPromo, sanitizedAmount);
    const finalAmount = Math.max(0, sanitizedAmount - discountAmount);

    return {
      valid: true,
      message: 'Promo code applied successfully',
      promo: normalizedPromo,
      discountAmount,
      finalAmount
    };
  }

  async update(id, updateData) {
    try {
      const db = getFirestore();
      const promoRef = db.collection(this.collection).doc(id);
      const doc = await promoRef.get();

      if (!doc.exists) {
        throw new Error('Promo code not found');
      }

      const existing = doc.data();
      const merged = this.formatDocument(updateData, existing);
      this.validateDefinition(merged);

      if (updateData.code && merged.code !== existing.code) {
        const duplicate = await this.findByCode(merged.code);
        if (duplicate && duplicate.id !== id) {
          throw new Error('Promo code already exists');
        }
      }

      await promoRef.update(merged);
      const updatedDoc = await promoRef.get();
      logger.info(`Promo code updated: ${id}`);
      return updatedDoc.data();
    } catch (error) {
      logger.error('Error updating promo code:', error);
      throw error;
    }
  }

  async incrementUsage(id) {
    try {
      const db = getFirestore();
      const promoRef = db.collection(this.collection).doc(id);
      const doc = await promoRef.get();

      if (!doc.exists) {
        throw new Error('Promo code not found');
      }

      const promo = doc.data();
      const nextUsedCount = Number(promo.usedCount || 0) + 1;

      await promoRef.update({
        usedCount: nextUsedCount,
        updatedAt: new Date()
      });

      return nextUsedCount;
    } catch (error) {
      logger.error('Error incrementing promo usage:', error);
      throw error;
    }
  }

  async delete(id) {
    try {
      const db = getFirestore();
      const promoRef = db.collection(this.collection).doc(id);
      const doc = await promoRef.get();

      if (!doc.exists) {
        throw new Error('Promo code not found');
      }

      await promoRef.delete();
      logger.info(`Promo code deleted: ${id}`);
      return { id, message: 'Promo code deleted successfully' };
    } catch (error) {
      logger.error('Error deleting promo code:', error);
      throw error;
    }
  }
}

module.exports = new PromoCode();
