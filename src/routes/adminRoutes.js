const express = require('express');
const {
  createAdmin,
  makeAdmin,
  listAdmins,
  removeAdmin,
  verifyAdmin,
  getAdminStats
} = require('../controllers/adminController');

const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Public route for initial admin creation
router.post('/create-admin', createAdmin);

// Protected routes (Admin only)
router.post('/make-admin', authenticateToken, requireAdmin, makeAdmin);
router.get('/list', authenticateToken, requireAdmin, listAdmins);
router.post('/remove-admin', authenticateToken, requireAdmin, removeAdmin);
router.get('/verify', authenticateToken, requireAdmin, verifyAdmin);
router.get('/stats', authenticateToken, requireAdmin, getAdminStats);

module.exports = router;