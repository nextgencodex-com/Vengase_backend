const Product = require('../models/Product');
const Category = require('../models/Category');
const logger = require('../utils/logger');

// @desc    Get all categories with product counts (legacy endpoint)
// @route   GET /api/v1/categories
// @access  Public
const getCategories = async (req, res, next) => {
  try {
    const categories = [
      't-shirts-shirts',
      'pants-shorts', 
      'slides-socks',
      'jackets-hoodies',
      'jewelry',
      'accessories',
      'bags',
      'bottles',
      'caps',
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

// @desc    Get all categories with subcategories
// @route   GET /api/v1/categories/all
// @access  Public
const getAllCategories = async (req, res, next) => {
  try {
    const categories = await Category.findAll();

    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Error in getAllCategories:', error);
    next(error);
  }
};

// @desc    Create a new category
// @route   POST /api/v1/categories
// @access  Private (Admin only)
const createCategory = async (req, res, next) => {
  try {
    const { name, label, subcategories } = req.body;

    // Check if category with same name already exists
    const existingCategory = await Category.findByName(name);
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }

    const category = await Category.create({
      name,
      label,
      subcategories: subcategories || []
    });

    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully'
    });
  } catch (error) {
    logger.error('Error in createCategory:', error);
    next(error);
  }
};

// @desc    Update a category
// @route   PUT /api/v1/categories/:id
// @access  Private (Admin only)
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, label } = req.body;

    const category = await Category.update(id, { name, label });

    res.status(200).json({
      success: true,
      data: category,
      message: 'Category updated successfully'
    });
  } catch (error) {
    logger.error('Error in updateCategory:', error);
    if (error.message === 'Category not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

// @desc    Delete a category
// @route   DELETE /api/v1/categories/:id
// @access  Private (Admin only)
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get category first to check if it's in use
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category is being used by products
    const isInUse = await Category.isInUse(category.name);
    if (isInUse) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category that is being used by products'
      });
    }

    await Category.delete(id);

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    logger.error('Error in deleteCategory:', error);
    next(error);
  }
};

// @desc    Add subcategory to a category
// @route   POST /api/v1/categories/:id/subcategories
// @access  Private (Admin only)
const addSubcategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { value, label } = req.body;

    const category = await Category.addSubcategory(id, { value, label });

    res.status(201).json({
      success: true,
      data: category,
      message: 'Subcategory added successfully'
    });
  } catch (error) {
    logger.error('Error in addSubcategory:', error);
    if (error.message === 'Category not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

// @desc    Update a subcategory
// @route   PUT /api/v1/categories/:id/subcategories/:subId
// @access  Private (Admin only)
const updateSubcategory = async (req, res, next) => {
  try {
    const { id, subId } = req.params;
    const { value, label } = req.body;

    const category = await Category.updateSubcategory(id, subId, { value, label });

    res.status(200).json({
      success: true,
      data: category,
      message: 'Subcategory updated successfully'
    });
  } catch (error) {
    logger.error('Error in updateSubcategory:', error);
    if (error.message === 'Category not found' || error.message === 'Subcategory not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

// @desc    Delete a subcategory
// @route   DELETE /api/v1/categories/:id/subcategories/:subId
// @access  Private (Admin only)
const deleteSubcategory = async (req, res, next) => {
  try {
    const { id, subId } = req.params;

    // Get category first
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Find the subcategory
    const subcategory = category.subcategories.find(sub => sub.id === subId);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found'
      });
    }

    // Check if subcategory is being used by products
    const isInUse = await Category.isSubcategoryInUse(subcategory.value);
    if (isInUse) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete subcategory that is being used by products'
      });
    }

    const updatedCategory = await Category.deleteSubcategory(id, subId);

    res.status(200).json({
      success: true,
      data: updatedCategory,
      message: 'Subcategory deleted successfully'
    });
  } catch (error) {
    logger.error('Error in deleteSubcategory:', error);
    next(error);
  }
};

// @desc    Initialize default categories
// @route   POST /api/v1/categories/initialize
// @access  Private (Admin only)
const initializeCategories = async (req, res, next) => {
  try {
    // Get existing categories
    const existingCategories = await Category.findAll();
    const existingNames = existingCategories.map(cat => cat.name);

    const defaultCategories = [
      {
        name: 'men',
        label: 'Men',
        subcategories: []
      },
      {
        name: 'women',
        label: 'Women',
        subcategories: []
      },
      {
        name: 'unisex',
        label: 'Unisex',
        subcategories: [
          { value: 't-shirts-shirts', label: 'T-shirts & Shirts' },
          { value: 'pants-shorts', label: 'Pants & Shorts' },
          { value: 'slides-socks', label: 'Slides & Socks' },
          { value: 'jackets-hoodies', label: 'Jackets & Hoodies' }
        ]
      },
      {
        name: 'accessories',
        label: 'Accessories',
        subcategories: [
          { value: 'bags', label: 'Bags & Backpacks' },
          { value: 'caps', label: 'Caps & Hats' },
          { value: 'bottles', label: 'Bottles' }
        ]
      },
      {
        name: 'jewelry',
        label: 'Jewelry',
        subcategories: [
          { value: 'bracelets', label: 'Bracelets' },
          { value: 'necklaces', label: 'Necklaces' },
          { value: 'rings', label: 'Rings' }
        ]
      }
    ];

    // Only add categories that don't exist
    const categoriesToAdd = defaultCategories.filter(
      cat => !existingNames.includes(cat.name)
    );

    if (categoriesToAdd.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All default categories already exist',
        added: 0
      });
    }

    // Add the missing categories
    for (const categoryData of categoriesToAdd) {
      await Category.create(categoryData);
    }

    res.status(200).json({
      success: true,
      message: `${categoriesToAdd.length} default categories initialized successfully`,
      added: categoriesToAdd.length,
      categories: categoriesToAdd.map(c => c.name)
    });
  } catch (error) {
    logger.error('Error in initializeCategories:', error);
    next(error);
  }
};

module.exports = {
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
};
