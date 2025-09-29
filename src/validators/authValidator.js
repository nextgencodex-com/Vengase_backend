const Joi = require('joi');

const createAdminSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  displayName: Joi.string().optional().min(2).max(100)
});

const validateCreateAdmin = (req, res, next) => {
  const { error } = createAdminSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  
  next();
};

module.exports = {
  validateCreateAdmin
};