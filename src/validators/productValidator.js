const Joi = require('joi');

const productSchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  price: Joi.number().required().min(0),
  description: Joi.string().required().min(3).max(500), // Reduced from 10 to 3
  detailedDescription: Joi.string().optional().allow('').max(2000),
  category: Joi.string().required().valid('tops', 'bottoms', 'jewelry', 'accessories', 'bags', 'bottles', 'caps', 'activewear', 'unisex'),
  subcategory: Joi.string().optional().allow('').max(100), // Added subcategory
  fabric: Joi.string().optional().allow('').max(100),
  features: Joi.array().items(Joi.string().max(100)).optional(),
  colors: Joi.array().items(Joi.string().max(50)).optional(),
  stock: Joi.object().pattern(
    Joi.string().valid('S', 'M', 'L', 'XL', 'XXL'),
    Joi.number().integer().min(0)
  ).optional(),
  img: Joi.string().optional().allow(''), // Allow any string including local paths
  rating: Joi.number().optional().min(0).max(5),
  reviews: Joi.number().integer().optional().min(0),
  status: Joi.string().optional().valid('instock', 'outofstock', 'discontinued')
});

const productUpdateSchema = Joi.object({
  name: Joi.string().optional().min(1).max(255),
  price: Joi.number().optional().min(0),
  description: Joi.string().optional().min(3).max(500), // Reduced from 10 to 3
  detailedDescription: Joi.string().optional().allow('').max(2000),
  category: Joi.string().optional().valid('tops', 'bottoms', 'jewelry', 'accessories', 'bags', 'bottles', 'caps', 'activewear', 'unisex'),
  subcategory: Joi.string().optional().allow('').max(100), // Added subcategory
  fabric: Joi.string().optional().allow('').max(100),
  features: Joi.array().items(Joi.string().max(100)).optional(),
  colors: Joi.array().items(Joi.string().max(50)).optional(),
  stock: Joi.object().pattern(
    Joi.string().valid('S', 'M', 'L', 'XL', 'XXL'),
    Joi.number().integer().min(0)
  ).optional(),
  img: Joi.string().optional().allow(''), // Allow any string including local paths
  rating: Joi.number().optional().min(0).max(5),
  reviews: Joi.number().integer().optional().min(0),
  status: Joi.string().optional().valid('instock', 'outofstock', 'discontinued')
});

const stockUpdateSchema = Joi.object({
  stock: Joi.object().pattern(
    Joi.string().valid('S', 'M', 'L', 'XL', 'XXL'),
    Joi.number().integer().min(0)
  ).required()
});

const validateProduct = (req, res, next) => {
  const { error } = productSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  
  next();
};

const validateProductUpdate = (req, res, next) => {
  const { error } = productUpdateSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  
  next();
};

const validateStockUpdate = (req, res, next) => {
  const { error } = stockUpdateSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  
  next();
};

module.exports = {
  validateProduct,
  validateProductUpdate,
  validateStockUpdate
};