const express = require('express');
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  updateProductStock,
  getProductsByCategory
} = require('../controllers/productController');

const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validateProduct, validateProductUpdate, validateStockUpdate } = require('../validators/productValidator');

const router = express.Router();

// Public routes
router.get('/', getProducts);
router.get('/search/:term', searchProducts);
router.get('/category/:category', getProductsByCategory);
router.get('/:id', getProduct);

// Protected routes (Admin only)
router.post('/', authenticateToken, requireAdmin, validateProduct, createProduct);
router.put('/:id', authenticateToken, requireAdmin, validateProductUpdate, updateProduct);
router.delete('/:id', authenticateToken, requireAdmin, deleteProduct);
router.patch('/:id/stock', authenticateToken, requireAdmin, validateStockUpdate, updateProductStock);

module.exports = router;