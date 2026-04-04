const PromoCode = require('../models/PromoCode');
const logger = require('../utils/logger');

const getPromoCodes = async (req, res, next) => {
  try {
    const promoCodes = await PromoCode.findAll();

    res.status(200).json({
      success: true,
      count: promoCodes.length,
      data: promoCodes
    });
  } catch (error) {
    logger.error('Error in getPromoCodes:', error);
    next(error);
  }
};

const createPromoCode = async (req, res, next) => {
  try {
    const promo = await PromoCode.create(req.body, req.user || {});

    res.status(201).json({
      success: true,
      data: promo,
      message: 'Promo code created successfully'
    });
  } catch (error) {
    logger.error('Error in createPromoCode:', error);
    if (error.message.includes('already exists') || error.message.includes('required') || error.message.includes('must')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
};

const updatePromoCode = async (req, res, next) => {
  try {
    const promo = await PromoCode.update(req.params.id, req.body);

    res.status(200).json({
      success: true,
      data: promo,
      message: 'Promo code updated successfully'
    });
  } catch (error) {
    logger.error('Error in updatePromoCode:', error);
    if (error.message === 'Promo code not found') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('already exists') || error.message.includes('must')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    next(error);
  }
};

const deletePromoCode = async (req, res, next) => {
  try {
    await PromoCode.delete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Promo code deleted successfully'
    });
  } catch (error) {
    logger.error('Error in deletePromoCode:', error);
    if (error.message === 'Promo code not found') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
};

const validatePromoCode = async (req, res, next) => {
  try {
    const { code, orderAmount } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Promo code is required'
      });
    }

    const result = await PromoCode.validateCode(code, Number(orderAmount || 0));

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        code: result.promo.code,
        discountType: result.promo.discountType,
        discountValue: result.promo.discountValue,
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
        minOrderAmount: result.promo.minOrderAmount,
        maxDiscountAmount: result.promo.maxDiscountAmount
      }
    });
  } catch (error) {
    logger.error('Error in validatePromoCode:', error);
    next(error);
  }
};

module.exports = {
  getPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  validatePromoCode
};
