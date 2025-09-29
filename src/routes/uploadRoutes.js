const express = require('express');
const {
  upload,
  uploadImage,
  uploadMultipleImages,
  deleteImage
} = require('../controllers/uploadController');

const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Protected routes (Admin only)
router.post('/image', authenticateToken, requireAdmin, upload.single('image'), uploadImage);
router.post('/images', authenticateToken, requireAdmin, upload.array('images', 10), uploadMultipleImages);
router.delete('/image/:fileName', authenticateToken, requireAdmin, deleteImage);

module.exports = router;