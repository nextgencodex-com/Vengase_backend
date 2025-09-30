const express = require('express');
const {
  registerUser,
  signInUser,
  updateProfile,
  syncCart,
  syncWishlist,
  addToCart,
  toggleWishlist,
  createAdmin,
  verifyAdmin,
  getProfile,
  revokeAdmin,
  getAllUsers,
  deleteUser
} = require('../controllers/authController');

const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validateCreateAdmin } = require('../validators/authValidator');

const router = express.Router();

// Public routes
router.post('/register', registerUser);
router.post('/signin', signInUser);

// Protected user routes
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.post('/sync-cart', authenticateToken, syncCart);
router.post('/sync-wishlist', authenticateToken, syncWishlist);
router.post('/cart/add', authenticateToken, addToCart);
router.post('/wishlist/toggle', authenticateToken, toggleWishlist);

// Admin routes
router.get('/verify-admin', authenticateToken, verifyAdmin);
router.get('/users', authenticateToken, requireAdmin, getAllUsers);
router.delete('/users/:uid', authenticateToken, requireAdmin, deleteUser);

// Super admin routes (require special admin permissions)
router.post('/create-admin', authenticateToken, requireAdmin, validateCreateAdmin, createAdmin);
router.post('/revoke-admin', authenticateToken, requireAdmin, revokeAdmin);

module.exports = router;