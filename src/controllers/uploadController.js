const multer = require('multer');
const ImageService = require('../services/ImageService');
const logger = require('../utils/logger');

// Configure multer for memory storage (we'll process images in memory)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// @desc    Upload product image
// @route   POST /api/v1/upload/image
// @access  Private (Admin)
const uploadImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    // Save the uploaded file to local images directory
    const imageUrl = await ImageService.saveUploadedFile(req.file);

    res.status(200).json({
      success: true,
      data: {
        imageUrl: imageUrl,
        message: 'Image uploaded successfully'
      }
    });
  } catch (error) {
    logger.error('Error in uploadImage:', error);
    
    if (error.message === 'Only image files are allowed') {
      return res.status(400).json({
        success: false,
        error: 'Only image files are allowed'
      });
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum 5MB allowed.'
      });
    }
    
    next(error);
  }
};

// @desc    Upload multiple product images
// @route   POST /api/v1/upload/images
// @access  Private (Admin)
const uploadMultipleImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files provided'
      });
    }

    // Save all uploaded files to local images directory
    const imageUrls = [];
    for (const file of req.files) {
      const imageUrl = await ImageService.saveUploadedFile(file);
      imageUrls.push(imageUrl);
    }

    res.status(200).json({
      success: true,
      data: {
        imageUrls: imageUrls,
        message: 'Images uploaded successfully'
      }
    });
  } catch (error) {
    logger.error('Error in uploadMultipleImages:', error);
    next(error);
  }
};

// @desc    Delete product image
// @route   DELETE /api/v1/upload/image/:fileName
// @access  Private (Admin)
const deleteImage = async (req, res, next) => {
  try {
    const { fileName } = req.params;
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: 'File name is required'
      });
    }

    // Delete the image file from local images directory
    await ImageService.deleteImage(fileName);

    res.status(200).json({
      success: true,
      data: {
        message: 'Image deleted successfully'
      }
    });
  } catch (error) {
    logger.error('Error in deleteImage:', error);
    
    if (error.message === 'Image file not found') {
      return res.status(404).json({
        success: false,
        error: 'Image file not found'
      });
    }
    
    next(error);
  }
};

module.exports = {
  upload,
  uploadImage,
  uploadMultipleImages,
  deleteImage
};