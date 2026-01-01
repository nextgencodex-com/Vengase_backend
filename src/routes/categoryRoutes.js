const express = require('express');
const {
  getCategories,
  getCategoryStats,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  addSubcategory,
  updateSubcategory,
  deleteSubcategory,
  initializeCategories
} = require('../controllers/categoryController');

const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validateCategory, validateSubcategory } = require('../validators/categoryValidator');

const router = express.Router();

// Public routes
router.get('/', getCategories);
router.get('/stats', getCategoryStats);
router.get('/all', getAllCategories);

// Protected routes (Admin only)
router.post('/', authenticateToken, requireAdmin, validateCategory, createCategory);
router.post('/initialize', authenticateToken, requireAdmin, initializeCategories);
router.put('/:id', authenticateToken, requireAdmin, validateCategory, updateCategory);
router.delete('/:id', authenticateToken, requireAdmin, deleteCategory);

// Subcategory routes
router.post('/:id/subcategories', authenticateToken, requireAdmin, validateSubcategory, addSubcategory);
router.put('/:id/subcategories/:subId', authenticateToken, requireAdmin, validateSubcategory, updateSubcategory);
router.delete('/:id/subcategories/:subId', authenticateToken, requireAdmin, deleteSubcategory);

module.exports = router;
