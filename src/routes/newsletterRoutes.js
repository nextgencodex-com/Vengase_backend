const express = require('express');
const router = express.Router();
const {
  subscribe,
  getSubscriptions,
  deleteSubscription,
  exportSubscriptions
} = require('../controllers/newsletterController');
const { authenticateToken } = require('../middleware/auth');

// Public route
router.post('/subscribe', subscribe);

// Admin routes (require authentication)
router.get('/subscriptions', authenticateToken, getSubscriptions);
router.delete('/subscriptions/:id', authenticateToken, deleteSubscription);
router.get('/export', authenticateToken, exportSubscriptions);

module.exports = router;
