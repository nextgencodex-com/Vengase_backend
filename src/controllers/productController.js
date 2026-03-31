const Product = require('../models/Product');
const ImageService = require('../services/ImageService');
const logger = require('../utils/logger');

const IMAGE_FALLBACK = '/images/prod1.png';

const normalizeCategoryAlias = (category) => {
  if (!category) return category;
  const normalized = String(category).trim().toLowerCase();
  return normalized === 'jewellery' ? 'jewelry' : normalized;
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDiscountFields = ({ price, discountPrice, discountPercentage }) => {
  const basePrice = Number(price) || 0;

  const parsedDiscountPrice = toNumberOrNull(discountPrice);
  const parsedDiscountPercentage = toNumberOrNull(discountPercentage);

  let normalizedDiscountPrice = null;
  let normalizedDiscountPercentage = null;
  let discountedPrice = null;

  if (parsedDiscountPrice !== null && parsedDiscountPrice > 0 && parsedDiscountPrice < basePrice) {
    normalizedDiscountPrice = parsedDiscountPrice;
    discountedPrice = parsedDiscountPrice;
  } else if (parsedDiscountPercentage !== null && parsedDiscountPercentage > 0 && parsedDiscountPercentage < 100) {
    normalizedDiscountPercentage = parsedDiscountPercentage;
    const computedPrice = basePrice * (1 - normalizedDiscountPercentage / 100);
    discountedPrice = Math.max(0, Number(computedPrice.toFixed(2)));
  }

  return {
    discountPrice: normalizedDiscountPrice,
    discountPercentage: normalizedDiscountPercentage,
    discountedPrice
  };
};

const normalizeImageList = (images = []) => {
  if (!Array.isArray(images)) return [];
  return images.filter(Boolean).slice(0, 4);
};

const processImageList = async (images = [], productName = 'product') => {
  const normalizedImages = normalizeImageList(images);
  const processed = [];

  for (const image of normalizedImages) {
    if (ImageService.isBase64Image(image)) {
      try {
        const saved = await ImageService.saveBase64Image(image, productName);
        processed.push(saved);
      } catch (error) {
        logger.warn('Failed to process one image, skipping:', error.message);
      }
    } else {
      processed.push(image);
    }
  }

  return processed.slice(0, 4);
};

// @desc    Get all products
// @route   GET /api/v1/products
// @access  Public
const getProducts = async (req, res, next) => {
  try {
    const filters = {
      category: normalizeCategoryAlias(req.query.category),
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
    let processedImages = await processImageList(req.body.images, req.body.name);

    // Backward compatibility for single image payloads
    if (processedImages.length === 0 && req.body.img) {
      if (ImageService.isBase64Image(req.body.img)) {
        try {
          const savedImage = await ImageService.saveBase64Image(req.body.img, req.body.name);
          processedImages = [savedImage];
          logger.info(`Image processed and saved for product: ${req.body.name}`);
        } catch (imageError) {
          logger.warn('Failed to save image, using fallback:', imageError.message);
          logger.error('Full image save error:', imageError);
          processedImages = [IMAGE_FALLBACK];
        }
      } else {
        processedImages = [req.body.img];
      }
    }

    if (processedImages.length === 0) {
      processedImages = [IMAGE_FALLBACK];
    }

    const isNewArrival = req.body.isNewArrival === true || req.body.isNewArrival === 'true';
    const sizeChartType = req.body.sizeChartType || null;
    const basePrice = parseFloat(req.body.price);
    const discountData = normalizeDiscountFields({
      price: basePrice,
      discountPrice: req.body.discountPrice,
      discountPercentage: req.body.discountPercentage
    });

    const productData = {
      name: req.body.name,
      price: basePrice,
      description: req.body.description,
      detailedDescription: req.body.detailedDescription,
      category: req.body.category,
      subcategory: req.body.subcategory,
      fabric: req.body.fabric,
      features: req.body.features || [],
      colors: req.body.colors || [],
      stock: req.body.stock || {},
      img: processedImages[0],
      images: processedImages,
      rating: req.body.rating || 0,
      reviews: req.body.reviews || 0,
      status: req.body.status || 'instock',
      discountPrice: discountData.discountPrice,
      discountPercentage: discountData.discountPercentage,
      discountedPrice: discountData.discountedPrice,
      sizeChartType: sizeChartType,
      isNewArrival: isNewArrival,
      newArrivalAddedAt: isNewArrival ? new Date().toISOString() : null
    };

    const product = await Product.create(productData);

    // Enforce max 4 new arrivals — remove oldest if exceeded
    if (isNewArrival) {
      await enforceNewArrivalLimit();
    }

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
    const currentProduct = await Product.findById(req.params.id);

    if (!currentProduct) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    // Parse price if provided
    if (updateData.price !== undefined) {
      updateData.price = parseFloat(updateData.price);
    }

    if ('discountPrice' in updateData) {
      updateData.discountPrice = toNumberOrNull(updateData.discountPrice);
    }

    if ('discountPercentage' in updateData) {
      updateData.discountPercentage = toNumberOrNull(updateData.discountPercentage);
    }

    // Handle isNewArrival flag
    const isNewArrival = updateData.isNewArrival === true || updateData.isNewArrival === 'true';
    if ('isNewArrival' in updateData) {
      updateData.isNewArrival = isNewArrival;
      if (isNewArrival) {
        updateData.newArrivalAddedAt = new Date().toISOString();
      } else {
        updateData.newArrivalAddedAt = null;
      }
    }

    if ('sizeChartType' in updateData) {
      updateData.sizeChartType = updateData.sizeChartType || null;
    }

    if ('price' in updateData || 'discountPrice' in updateData || 'discountPercentage' in updateData) {
      const mergedDiscountData = normalizeDiscountFields({
        price: 'price' in updateData ? updateData.price : currentProduct.price,
        discountPrice: 'discountPrice' in updateData ? updateData.discountPrice : currentProduct.discountPrice,
        discountPercentage: 'discountPercentage' in updateData ? updateData.discountPercentage : currentProduct.discountPercentage
      });

      updateData.discountPrice = mergedDiscountData.discountPrice;
      updateData.discountPercentage = mergedDiscountData.discountPercentage;
      updateData.discountedPrice = mergedDiscountData.discountedPrice;
    }

    // Handle multi-image update
    if ('images' in updateData) {
      const processedImages = await processImageList(updateData.images, updateData.name || currentProduct.name);
      if (processedImages.length > 0) {
        updateData.images = processedImages;
        updateData.img = processedImages[0];
      } else {
        delete updateData.images;
      }
    }

    // Handle image update
    if (updateData.img && ImageService.isBase64Image(updateData.img)) {
      try {
        // Save new image
        const newImageUrl = await ImageService.saveBase64Image(updateData.img, updateData.name);
        updateData.img = newImageUrl;
        updateData.images = [newImageUrl];
        
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

    // Enforce max 4 new arrivals if this product was just marked
    if (isNewArrival && 'isNewArrival' in req.body) {
      await enforceNewArrivalLimit(req.params.id);
    }

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

    // Delete associated images if they exist
    const imagesToDelete = normalizeImageList(product.images);
    if (imagesToDelete.length === 0 && product.img) {
      imagesToDelete.push(product.img);
    }

    for (const imageUrl of imagesToDelete) {
      if (imageUrl && imageUrl.startsWith('/uploads/') && !imageUrl.includes('placeholder')) {
        try {
          await ImageService.deleteImage(imageUrl);
          logger.info(`Image deleted for product: ${req.params.id}`);
        } catch (imageError) {
          logger.warn('Failed to delete product image:', imageError.message);
        }
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

// Helper: keep only the 4 most recent new arrivals, un-mark older ones
const enforceNewArrivalLimit = async (currentProductId = null) => {
  try {
    const allProducts = await Product.findAllSimple();
    const newArrivals = allProducts
      .filter(p => p.isNewArrival === true)
      .sort((a, b) => new Date(b.newArrivalAddedAt) - new Date(a.newArrivalAddedAt));

    if (newArrivals.length > 4) {
      // Un-mark the oldest ones beyond the 4 limit
      const toRemove = newArrivals.slice(4);
      for (const p of toRemove) {
        await Product.update(p.id, { isNewArrival: false, newArrivalAddedAt: null });
        logger.info(`Removed product ${p.id} from New Arrivals (limit enforced)`);
      }
    }
  } catch (err) {
    logger.warn('enforceNewArrivalLimit error:', err.message);
  }
};

// @desc    Get new arrival products (max 4)
// @route   GET /api/v1/products/new-arrivals
// @access  Public
const getNewArrivals = async (req, res, next) => {
  try {
    const allProducts = await Product.findAllSimple();
    const flaggedNewArrivals = allProducts
      .filter(p => p.isNewArrival === true)
      .sort((a, b) => new Date(b.newArrivalAddedAt) - new Date(a.newArrivalAddedAt))
      .slice(0, 4);

    // Keep homepage stable at 4 cards by backfilling with most recent products.
    const selectedIds = new Set(flaggedNewArrivals.map((p) => String(p.id)));
    const recentFallback = allProducts
      .filter((p) => !selectedIds.has(String(p.id)))
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || a.newArrivalAddedAt || 0).getTime();
        const bTime = new Date(b.createdAt || b.newArrivalAddedAt || 0).getTime();
        if (aTime !== bTime) return bTime - aTime;
        return Number(b.id || 0) - Number(a.id || 0);
      });

    const newArrivals = [...flaggedNewArrivals, ...recentFallback].slice(0, 4);

    res.status(200).json({
      success: true,
      count: newArrivals.length,
      data: newArrivals
    });
  } catch (error) {
    logger.error('Error in getNewArrivals:', error);
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
  getProductsByCategory,
  getNewArrivals
};