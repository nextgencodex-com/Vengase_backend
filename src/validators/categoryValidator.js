const logger = require('../utils/logger');

// Validate category creation/update
const validateCategory = (req, res, next) => {
  const { name, label } = req.body;
  const errors = [];

  // Validate name
  if (!name || typeof name !== 'string' || name.trim() === '') {
    errors.push('Category name is required and must be a non-empty string');
  } else if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push('Category name must be lowercase letters, numbers, and hyphens only');
  }

  // Validate label
  if (!label || typeof label !== 'string' || label.trim() === '') {
    errors.push('Category label is required and must be a non-empty string');
  }

  if (errors.length > 0) {
    logger.warn('Category validation failed:', errors);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

// Validate subcategory creation/update
const validateSubcategory = (req, res, next) => {
  const { value, label } = req.body;
  const errors = [];

  // Validate value
  if (!value || typeof value !== 'string' || value.trim() === '') {
    errors.push('Subcategory value is required and must be a non-empty string');
  } else if (!/^[a-z0-9-]+$/.test(value)) {
    errors.push('Subcategory value must be lowercase letters, numbers, and hyphens only');
  }

  // Validate label
  if (!label || typeof label !== 'string' || label.trim() === '') {
    errors.push('Subcategory label is required and must be a non-empty string');
  }

  if (errors.length > 0) {
    logger.warn('Subcategory validation failed:', errors);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  next();
};

module.exports = {
  validateCategory,
  validateSubcategory
};
