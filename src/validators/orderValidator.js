const Joi = require('joi');

const orderSchema = Joi.object({
  userEmail: Joi.string().email().required(),
  userName: Joi.string().required().min(2).max(100),
  phone: Joi.string().required().min(10).max(15),
  items: Joi.array().items(Joi.object({
    productId: Joi.number().required(),
    name: Joi.string().required(),
    price: Joi.number().required().min(0),
    quantity: Joi.number().required().min(1),
    size: Joi.string().optional(),
    color: Joi.string().optional(),
    img: Joi.string().optional()
  })).min(1).required(),
  totalAmount: Joi.number().required().min(0),
  shippingAddress: Joi.object({
    address: Joi.string().required().min(5).max(500),
    city: Joi.string().required().min(2).max(100),
    postalCode: Joi.string().required().min(3).max(10),
    country: Joi.string().default('Sri Lanka')
  }).required(),
  paymentMethod: Joi.string().optional().allow(''),
  notes: Joi.string().optional().allow('').max(500)
});

const orderStatusUpdateSchema = Joi.object({
  status: Joi.string().required().valid('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')
});

const paymentStatusUpdateSchema = Joi.object({
  status: Joi.string().required().valid('pending', 'completed', 'failed', 'refunded')
});

const validateOrder = (req, res, next) => {
  const { error } = orderSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  
  next();
};

const validateOrderStatusUpdate = (req, res, next) => {
  const { error } = orderStatusUpdateSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  
  next();
};

const validatePaymentStatusUpdate = (req, res, next) => {
  const { error } = paymentStatusUpdateSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  
  next();
};

module.exports = {
  validateOrder,
  validateOrderStatusUpdate,
  validatePaymentStatusUpdate
};
