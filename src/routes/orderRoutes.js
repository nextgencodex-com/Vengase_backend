const express = require('express');
const router = express.Router();
const {
  createOrder,
  getAllOrders,
  getOrderById,
  getUserOrders,
  updateOrderStatus,
  updatePaymentStatus,
  getOrderStats
} = require('../controllers/orderController');
const {
  validateOrder,
  validateOrderStatusUpdate,
  validatePaymentStatusUpdate
} = require('../validators/orderValidator');
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware');

// Public routes (guest checkout allowed)
router.post('/', validateOrder, createOrder);

// Authenticated routes
router.get('/user/:userId', authenticateToken, getUserOrders);
router.get('/:id', authenticateToken, getOrderById);

// Admin only routes
router.get('/', authenticateToken, isAdmin, getAllOrders);
router.get('/stats/overview', authenticateToken, isAdmin, getOrderStats);
router.patch('/:orderId/status', authenticateToken, isAdmin, validateOrderStatusUpdate, updateOrderStatus);
router.patch('/:orderId/payment', authenticateToken, isAdmin, validatePaymentStatusUpdate, updatePaymentStatus);

module.exports = router;
