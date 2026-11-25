const express = require('express');
const router = express.Router();
const {
  subscribe,
  getSubscriptions,
  deleteSubscription,
  exportSubscriptions
} = require('../controllers/newsletterController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Public route
router.post('/subscribe', subscribe);

// Admin routes (require authentication and admin privileges)
router.get('/subscriptions', authenticateToken, requireAdmin, getSubscriptions);
router.delete('/subscriptions/:id', authenticateToken, requireAdmin, deleteSubscription);
router.get('/export', authenticateToken, requireAdmin, exportSubscriptions);

module.exports = router;
