const express = require('express');
const {
  getCategories,
  getCategoryStats
} = require('../controllers/categoryController');

const router = express.Router();

// Public routes
router.get('/', getCategories);
router.get('/stats', getCategoryStats);

module.exports = router;