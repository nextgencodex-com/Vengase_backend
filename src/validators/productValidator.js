const Joi = require('joi');

const validationOptions = {
  abortEarly: true,
  stripUnknown: true
};

const productSchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  price: Joi.number().required().min(0),
  description: Joi.string().required().min(3).max(500),
  detailedDescription: Joi.string().optional().allow('').max(2000),
  category: Joi.string().required().min(1).max(100),
  subcategory: Joi.string().optional().allow('').max(100),
  fabric: Joi.string().optional().allow('').max(100),
  features: Joi.array().items(Joi.string().max(100)).optional(),
  colors: Joi.array().items(Joi.string().max(50)).optional(),
  stock: Joi.object().pattern(
    Joi.string(),
    Joi.number().integer().min(0)
  ).optional(),
  img: Joi.string().optional().allow(''),
  images: Joi.array().items(Joi.string().allow('')).max(4).optional(),
  rating: Joi.number().optional().min(0).max(5),
  reviews: Joi.number().integer().optional().min(0),
  status: Joi.string().optional().valid('instock', 'outofstock', 'discontinued'),
  discountPrice: Joi.number().optional().allow(null).min(0),
  discountPercentage: Joi.number().optional().allow(null).min(0).max(100),
  discountedPrice: Joi.number().optional().allow(null).min(0),
  sizeChartType: Joi.string().optional().allow('', null, 'polo', 'hoodies', 'oversize'),
  isNewArrival: Joi.boolean().optional(),
  newArrivalAddedAt: Joi.string().optional().allow(null, '')
});

const productUpdateSchema = Joi.object({
  name: Joi.string().optional().min(1).max(255),
  price: Joi.number().optional().min(0),
  description: Joi.string().optional().min(3).max(500),
  detailedDescription: Joi.string().optional().allow('').max(2000),
  category: Joi.string().optional().min(1).max(100),
  subcategory: Joi.string().optional().allow('').max(100),
  fabric: Joi.string().optional().allow('').max(100),
  features: Joi.array().items(Joi.string().max(100)).optional(),
  colors: Joi.array().items(Joi.string().max(50)).optional(),
  stock: Joi.object().pattern(
    Joi.string(),
    Joi.number().integer().min(0)
  ).optional(),
  img: Joi.string().optional().allow(''),
  images: Joi.array().items(Joi.string().allow('')).max(4).optional(),
  rating: Joi.number().optional().min(0).max(5),
  reviews: Joi.number().integer().optional().min(0),
  status: Joi.string().optional().valid('instock', 'outofstock', 'discontinued'),
  discountPrice: Joi.number().optional().allow(null).min(0),
  discountPercentage: Joi.number().optional().allow(null).min(0).max(100),
  discountedPrice: Joi.number().optional().allow(null).min(0),
  sizeChartType: Joi.string().optional().allow('', null, 'polo', 'hoodies', 'oversize'),
  isNewArrival: Joi.boolean().optional(),
  newArrivalAddedAt: Joi.string().optional().allow(null, '')
});

const stockUpdateSchema = Joi.object({
  stock: Joi.object().pattern(
    Joi.string(), // Accept any size
    Joi.number().integer().min(0)
  ).required()
});

const validateProduct = (req, res, next) => {
  const { error, value } = productSchema.validate(req.body, validationOptions);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  req.body = value;
  
  next();
};

const validateProductUpdate = (req, res, next) => {
  const { error, value } = productUpdateSchema.validate(req.body, validationOptions);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  req.body = value;
  
  next();
};

const validateStockUpdate = (req, res, next) => {
  const { error, value } = stockUpdateSchema.validate(req.body, validationOptions);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  req.body = value;
  
  next();
};

module.exports = {
  validateProduct,
  validateProductUpdate,
  validateStockUpdate
};