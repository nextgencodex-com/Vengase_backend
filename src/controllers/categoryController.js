const Product = require('../models/Product');
const logger = require('../utils/logger');

// @desc    Get all categories with product counts
// @route   GET /api/v1/categories
// @access  Public
const getCategories = async (req, res, next) => {
  try {
    const categories = [
      't-shirts-shirts',
      'pants-shorts', 
      'jewelry',
      'accessories',
      'bags',
      'bottles',
      'caps',
      'slides-socks',
      'unisex'
    ];

    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const products = await Product.findAll({ category, status: 'instock' });
        return {
          name: category,
          displayName: category.charAt(0).toUpperCase() + category.slice(1),
          productCount: products.length
        };
      })
    );

    res.status(200).json({
      success: true,
      data: categoriesWithCounts
    });
  } catch (error) {
    logger.error('Error in getCategories:', error);
    next(error);
  }
};

// @desc    Get category statistics
// @route   GET /api/v1/categories/stats
// @access  Public
const getCategoryStats = async (req, res, next) => {
  try {
    const allProducts = await Product.findAll();
    
    const stats = {};
    
    allProducts.forEach(product => {
      const category = product.category;
      if (!stats[category]) {
        stats[category] = {
          total: 0,
          inStock: 0,
          outOfStock: 0,
          averagePrice: 0,
          totalValue: 0
        };
      }
      
      stats[category].total += 1;
      
      if (product.status === 'instock') {
        stats[category].inStock += 1;
      } else {
        stats[category].outOfStock += 1;
      }
      
      stats[category].totalValue += product.price;
    });

    // Calculate average prices
    Object.keys(stats).forEach(category => {
      stats[category].averagePrice = stats[category].totalValue / stats[category].total;
    });

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error in getCategoryStats:', error);
    next(error);
  }
};

module.exports = {
  getCategories,
  getCategoryStats
};