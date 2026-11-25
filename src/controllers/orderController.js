const Order = require('../models/Order');
const PromoCode = require('../models/PromoCode');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const { auditLog } = require('../utils/auditLogger');
const { sendOrderConfirmationEmails } = require('../utils/emailService');

const STANDARD_SHIPPING_FEE = Number(process.env.STANDARD_SHIPPING_FEE || 399);

/**
 * Resolve the authoritative unit price of a product from Firestore.
 */
const resolveAuthoritativeUnitPrice = (product) => {
  const basePrice = Number(product.price);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error(`Invalid catalog price for product ${product.id || product.name}`);
  }

  const explicitDiscounted = product.discountedPrice ?? product.discountPrice;
  if (explicitDiscounted !== undefined && explicitDiscounted !== null && explicitDiscounted !== '') {
    const disc = Number(explicitDiscounted);
    if (Number.isFinite(disc) && disc >= 0 && disc < basePrice) {
      return Math.round(disc * 100) / 100;
    }
  }

  const pct = Number(product.discountPercentage);
  if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
    return Math.round(basePrice * (1 - pct / 100) * 100) / 100;
  }

  return Math.round(basePrice * 100) / 100;
};

// Create new order
const createOrder = async (req, res, next) => {
  try {
    const normalizedPaymentMethod = String(req.body.paymentMethod || '').trim().toLowerCase();
    const requestedPromoCode = String(req.body.promoCode || '').trim();
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

    // Recompute authoritative line-item prices and subtotal from Firestore product catalog
    const verifiedItems = [];
    let computedSubtotal = 0;

    for (const item of rawItems) {
      const productId = item?.productId;
      const quantity = Math.floor(Number(item?.quantity));

      if (!productId || !Number.isFinite(quantity) || quantity < 1 || quantity > 100) {
        return res.status(400).json({
          success: false,
          error: 'Invalid product ID or item quantity'
        });
      }

      const catalogProduct = await Product.findById(productId);
      if (!catalogProduct) {
        return res.status(400).json({
          success: false,
          error: `Product not found: ${productId}`
        });
      }

      if (catalogProduct.status === 'outofstock' || catalogProduct.status === 'discontinued') {
        return res.status(400).json({
          success: false,
          error: `Product is currently unavailable: ${catalogProduct.name}`
        });
      }

      const authoritativePrice = resolveAuthoritativeUnitPrice(catalogProduct);
      computedSubtotal += authoritativePrice * quantity;

      verifiedItems.push({
        productId: catalogProduct.id ?? productId,
        name: catalogProduct.name || item.name,
        price: authoritativePrice,
        quantity,
        size: item.size || '',
        color: item.color || '',
        img: catalogProduct.img || item.img || ''
      });
    }

    const subtotalAmount = Math.round(computedSubtotal * 100) / 100;
    const requestedShipping = Number(req.body.shippingAmount);
    const shippingAmount = Number.isFinite(requestedShipping) && requestedShipping >= STANDARD_SHIPPING_FEE
      ? Math.round(requestedShipping * 100) / 100
      : STANDARD_SHIPPING_FEE;

    let promoCode = null;
    let promoCodeId = null;
    let discountAmount = 0;
    let finalTotalAmount = Math.round((subtotalAmount + shippingAmount) * 100) / 100;

    if (requestedPromoCode) {
      const promoResult = await PromoCode.validateCode(requestedPromoCode, subtotalAmount);
      if (!promoResult.valid) {
        return res.status(400).json({
          success: false,
          error: promoResult.message
        });
      }

      promoCode = promoResult.promo.code;
      promoCodeId = promoResult.promo.id;
      discountAmount = Number(promoResult.discountAmount || 0);
      finalTotalAmount = Math.max(0, Math.round((Number(promoResult.finalAmount || 0) + shippingAmount) * 100) / 100);

      // Atomically validate and increment promo code usage via Firestore transaction
      try {
        await PromoCode.incrementUsage(promoCodeId);
      } catch (promoError) {
        return res.status(400).json({
          success: false,
          error: promoError.message || 'Promo code usage limit reached'
        });
      }
    }

    logger.info(`Create order request received. paymentMethod(raw='${req.body.paymentMethod || ''}', normalized='${normalizedPaymentMethod || ''}'), userEmail='${req.body.userEmail || ''}', serverTotal=${finalTotalAmount}`);

    const orderData = {
      userId: req.user?.uid || null, // From optionalAuth middleware (null for guest checkout)
      userEmail: req.body.userEmail,
      userName: req.body.userName,
      items: verifiedItems,
      subtotalAmount,
      shippingAmount,
      discountAmount,
      promoCode,
      promoCodeId,
      totalAmount: finalTotalAmount,
      shippingAddress: req.body.shippingAddress,
      phone: req.body.phone,
      paymentMethod: normalizedPaymentMethod || req.body.paymentMethod,
      notes: req.body.notes
    };

    const order = await Order.create(orderData);

    // If order is Cash on Delivery, send confirmation email immediately
    if (normalizedPaymentMethod === 'cod' || normalizedPaymentMethod === 'cash_on_delivery') {
      const codOrderId = order.orderId || order.id;
      logger.info(`COD order detected. Triggering confirmation emails for order ${codOrderId}.`);
      // Attempt both notifications after saving the order; COD has no online payment callback.
      try {
        await sendOrderConfirmationEmails(codOrderId);
      } catch (err) {
        logger.error(`COD email send failed for order ${codOrderId}: ${err?.message || err}`);
      }
    } else {
      logger.info(`Order ${order.orderId} created with payment method '${orderData.paymentMethod}'. Email will be sent after payment confirmation.`);
    }

    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully'
    });
  } catch (error) {
    logger.error('Error in createOrder:', error);
    next(error);
  }
};

// Get all orders (admin only)
const getAllOrders = async (req, res, next) => {
  try {
    const filters = {
      orderStatus: req.query.orderStatus,
      paymentStatus: req.query.paymentStatus,
      limit: req.query.limit
    };

    const orders = await Order.findAll(filters);

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    logger.error('Error in getAllOrders:', error);
    next(error);
  }
};

// Get order by ID
const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if user is admin or order owner
    if (!req.user?.isAdmin && !req.user?.admin && req.user?.uid !== order.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this order'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    logger.error('Error in getOrderById:', error);
    next(error);
  }
};

// Get user's orders
const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const userEmail = req.user?.email || req.query?.email;

    // Check if user is admin or requesting their own orders
    if (!req.user?.isAdmin && !req.user?.admin && req.user?.uid !== userId && req.user?.email !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view these orders'
      });
    }

    const orders = await Order.findByUserId(userId, userEmail);

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    logger.error('Error in getUserOrders:', error);
    next(error);
  }
};

// Update order status (admin only)
const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.updateOrderStatus(orderId, status);

    res.status(200).json({
      success: true,
      data: order,
      message: `Order status updated to ${status}`
    });
  } catch (error) {
    logger.error('Error in updateOrderStatus:', error);
    next(error);
  }
};

// Update payment status (admin only)
const updatePaymentStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const normalizedStatus = String(status || '').trim().toLowerCase();

    const validStatuses = ['pending', 'completed', 'failed', 'refunded', 'paid'];
    if (!validStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.updatePaymentStatus(orderId, normalizedStatus);

    auditLog('ORDER_PAYMENT_STATUS_UPDATED', {
      actor: req.user,
      ip: req.ip,
      target: orderId,
      details: { status: normalizedStatus }
    });

    if (normalizedStatus === 'paid' || normalizedStatus === 'completed') {
      try {
        const effectiveOrderId = order?.orderId || orderId;
        await sendOrderConfirmationEmails(effectiveOrderId);
        logger.info(`Triggered confirmation email for order ${effectiveOrderId} on payment update to ${normalizedStatus}`);
      } catch (emailErr) {
        logger.error(`Failed to send confirmation email on payment update for order ${orderId}:`, emailErr);
      }
    }

    res.status(200).json({
      success: true,
      data: order,
      message: `Payment status updated to ${normalizedStatus}`
    });
  } catch (error) {
    logger.error('Error in updatePaymentStatus:', error);
    next(error);
  }
};

// Get order statistics (admin only)
const getOrderStats = async (req, res, next) => {
  try {
    const stats = await Order.getStats();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error in getOrderStats:', error);
    next(error);
  }
};

// Delete order (admin only)
const deleteOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    await Order.delete(orderId);
    auditLog('ORDER_DELETED', { actor: req.user, ip: req.ip, target: orderId });

    res.status(200).json({
      success: true,
      message: `Order ${orderId} deleted successfully`
    });
  } catch (error) {
    logger.error('Error in deleteOrder:', error);
    next(error);
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getOrderById,
  getUserOrders,
  updateOrderStatus,
  updatePaymentStatus,
  getOrderStats,
  deleteOrder
};
