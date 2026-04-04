const express = require('express');
const {
  getPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  validatePromoCode
} = require('../controllers/promoCodeController');
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Public validation route used by checkout
router.post('/validate', validatePromoCode);

// Admin routes
router.get('/', authenticateToken, isAdmin, getPromoCodes);
router.post('/', authenticateToken, isAdmin, createPromoCode);
router.put('/:id', authenticateToken, isAdmin, updatePromoCode);
router.delete('/:id', authenticateToken, isAdmin, deletePromoCode);

module.exports = router;
