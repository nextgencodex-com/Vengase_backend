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
const { validateCreateAdmin } = require('../validators/authValidator');

const router = express.Router();

// Protected routes (Admin only)
router.post('/create-admin', authenticateToken, requireAdmin, validateCreateAdmin, createAdmin);
router.post('/make-admin', authenticateToken, requireAdmin, makeAdmin);
router.get('/list', authenticateToken, requireAdmin, listAdmins);
router.post('/remove-admin', authenticateToken, requireAdmin, removeAdmin);
router.get('/verify', authenticateToken, requireAdmin, verifyAdmin);
router.get('/stats', authenticateToken, requireAdmin, getAdminStats);

module.exports = router;