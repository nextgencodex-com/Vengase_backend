const express = require('express');
const {
  createAdmin,
  verifyAdmin,
  getProfile,
  revokeAdmin
} = require('../controllers/authController');

const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validateCreateAdmin } = require('../validators/authValidator');

const router = express.Router();

// Protected routes
router.get('/profile', authenticateToken, getProfile);
router.get('/verify-admin', authenticateToken, verifyAdmin);

// Super admin routes (require special admin permissions)
router.post('/create-admin', authenticateToken, requireAdmin, validateCreateAdmin, createAdmin);
router.post('/revoke-admin', authenticateToken, requireAdmin, revokeAdmin);

module.exports = router;