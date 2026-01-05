const Product = require('../models/Product');
const ImageService = require('../services/ImageService');
const logger = require('../utils/logger');

// @desc    Get all products
// @route   GET /api/v1/products
// @access  Public
const getProducts = async (req, res, next) => {
  try {
    const filters = {
      category: req.query.category,
      subcategory: req.query.subcategory,
      status: req.query.status,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
      limit: req.query.limit || 50,
      offset: req.query.offset || 0,
      q: req.query.q
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === '') {
        delete filters[key];
      }
    });

    // Use simple query if no filters to avoid index issues
    const products = Object.keys(filters).length === 0 
      ? await Product.findAllSimple()
      : await Product.findAll(filters);
    
    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    logger.error('Error in getProducts:', error);
    next(error);
  }
};

// @desc    Get single product
// @route   GET /api/v1/products/:id
// @access  Public
const getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    logger.error('Error in getProduct:', error);
    next(error);
  }
};

// @desc    Create new product
// @route   POST /api/v1/products
// @access  Private (Admin)
const createProduct = async (req, res, next) => {
  try {
    let imageUrl = req.body.img;

    // Handle base64 image data from frontend
    if (ImageService.isBase64Image(req.body.img)) {
      try {
        imageUrl = await ImageService.saveBase64Image(req.body.img, req.body.name);
        logger.info(`Image processed and saved for product: ${req.body.name}`);
      } catch (imageError) {
        logger.warn('Failed to save image, using fallback:', imageError.message);
        logger.error('Full image save error:', imageError);
        imageUrl = '/images/prod1.png'; // Fallback to existing image
      }
    }

    const productData = {
      name: req.body.name,
      price: parseFloat(req.body.price),
      description: req.body.description,
      detailedDescription: req.body.detailedDescription,
      category: req.body.category,
      subcategory: req.body.subcategory,
      fabric: req.body.fabric,
      features: req.body.features || [],
      colors: req.body.colors || [],
      stock: req.body.stock || {},
      img: imageUrl,
      rating: req.body.rating || 0,
      reviews: req.body.reviews || 0,
      status: req.body.status || 'instock'
    };

    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    logger.error('Error in createProduct:', error);
    next(error);
  }
};

// @desc    Update product
// @route   PUT /api/v1/products/:id
// @access  Private (Admin)
const updateProduct = async (req, res, next) => {
  try {
    const updateData = { ...req.body };
    
    // Parse price if provided
    if (updateData.price) {
      updateData.price = parseFloat(updateData.price);
    }

    // Handle image update
    if (updateData.img && ImageService.isBase64Image(updateData.img)) {
      try {
        // Get the current product to potentially delete old image
        const currentProduct = await Product.findById(req.params.id);
        
        // Save new image
        const newImageUrl = await ImageService.saveBase64Image(updateData.img, updateData.name);
        updateData.img = newImageUrl;
        
        // Delete old image if it exists and is not a placeholder
        if (currentProduct && currentProduct.img && 
            currentProduct.img.startsWith('/images/') && 
            !currentProduct.img.includes('placeholder')) {
          try {
            await ImageService.deleteImage(currentProduct.img);
          } catch (deleteError) {
            logger.warn('Failed to delete old image:', deleteError.message);
          }
        }
        
        logger.info(`Image updated for product: ${req.params.id}`);
      } catch (imageError) {
        logger.warn('Failed to update image:', imageError.message);
        // Don't fail the entire update if image processing fails
        delete updateData.img;
      }
    }

    const product = await Product.update(req.params.id, updateData);

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    logger.error('Error in updateProduct:', error);
    next(error);
  }
};

// @desc    Delete product
// @route   DELETE /api/v1/products/:id
// @access  Private (Admin)
const deleteProduct = async (req, res, next) => {
  try {
    // Get the product first to handle image cleanup
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Delete associated image if it exists
    if (product.img && product.img.startsWith('/images/') && 
        !product.img.includes('placeholder')) {
      try {
        await ImageService.deleteImage(product.img);
        logger.info(`Image deleted for product: ${req.params.id}`);
      } catch (imageError) {
        logger.warn('Failed to delete product image:', imageError.message);
      }
    }

    // Delete the product from database
    await Product.delete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    logger.error('Error in deleteProduct:', error);
    next(error);
  }
};

// @desc    Search products
// @route   GET /api/v1/products/search/:term
// @access  Public
const searchProducts = async (req, res, next) => {
  try {
    const searchTerm = req.params.term;
    const products = await Product.search(searchTerm);

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    logger.error('Error in searchProducts:', error);
    next(error);
  }
};

// @desc    Update product stock
// @route   PATCH /api/v1/products/:id/stock
// @access  Private (Admin)
const updateProductStock = async (req, res, next) => {
  try {
    const { stock } = req.body;
    
    if (!stock || typeof stock !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Stock object is required'
      });
    }

    const product = await Product.updateStock(req.params.id, stock);

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    logger.error('Error in updateProductStock:', error);
    next(error);
  }
};

// @desc    Get products by category
// @route   GET /api/v1/products/category/:category
// @access  Public
const getProductsByCategory = async (req, res, next) => {
  try {
    const filters = {
      category: req.params.category,
      limit: req.query.limit,
      offset: req.query.offset,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder
    };

    const products = await Product.findAll(filters);

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    logger.error('Error in getProductsByCategory:', error);
    next(error);
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  updateProductStock,
  getProductsByCategory
};