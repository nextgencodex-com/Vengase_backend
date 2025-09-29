const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const logger = require('../utils/logger');

class ImageService {
  constructor() {
    // Path to the frontend's public/images directory
    this.imageDir = path.join(__dirname, '../../../vengase-website/public/images');
    this.baseUrl = '/images'; // URL path for accessing images
  }

  async ensureImageDirectory() {
    try {
      await fs.access(this.imageDir);
    } catch (error) {
      // Directory doesn't exist, create it
      await fs.mkdir(this.imageDir, { recursive: true });
      logger.info(`Created image directory: ${this.imageDir}`);
    }
  }

  async saveBase64Image(base64Data, originalName = null) {
    try {
      await this.ensureImageDirectory();

      // Remove data URL prefix if present (data:image/jpeg;base64,...)
      const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      
      // Generate unique filename
      const timestamp = Date.now();
      const random = crypto.randomBytes(4).toString('hex');
      const extension = this.getExtensionFromBase64(base64Data) || 'jpg';
      const filename = `product_${timestamp}_${random}.${extension}`;
      
      const filePath = path.join(this.imageDir, filename);
      
      // Convert base64 to buffer and save
      const buffer = Buffer.from(base64String, 'base64');
      await fs.writeFile(filePath, buffer);
      
      logger.info(`Image saved: ${filename}`);
      
      // Return the URL path that the frontend can use
      return `${this.baseUrl}/${filename}`;
    } catch (error) {
      logger.error('Error saving base64 image:', error);
      throw new Error('Failed to save image');
    }
  }

  async saveUploadedFile(file) {
    try {
      await this.ensureImageDirectory();

      // Generate unique filename
      const timestamp = Date.now();
      const random = crypto.randomBytes(4).toString('hex');
      const extension = path.extname(file.originalname);
      const filename = `product_${timestamp}_${random}${extension}`;
      
      const filePath = path.join(this.imageDir, filename);
      
      // Move uploaded file to images directory
      await fs.writeFile(filePath, file.buffer);
      
      logger.info(`Uploaded image saved: ${filename}`);
      
      // Return the URL path that the frontend can use
      return `${this.baseUrl}/${filename}`;
    } catch (error) {
      logger.error('Error saving uploaded file:', error);
      throw new Error('Failed to save uploaded image');
    }
  }

  async deleteImage(imageUrl) {
    try {
      // Extract filename from URL path
      const filename = path.basename(imageUrl);
      const filePath = path.join(this.imageDir, filename);
      
      // Check if file exists before deleting
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        logger.info(`Image deleted: ${filename}`);
        return true;
      } catch (error) {
        logger.warn(`Image file not found: ${filename}`);
        throw new Error('Image file not found');
      }
    } catch (error) {
      if (error.message === 'Image file not found') {
        throw error;
      }
      logger.error('Error deleting image:', error);
      throw new Error('Failed to delete image');
    }
  }

  getExtensionFromBase64(base64String) {
    const matches = base64String.match(/^data:image\/([a-z]+);base64,/);
    if (matches && matches[1]) {
      const mimeType = matches[1];
      switch (mimeType) {
        case 'jpeg':
        case 'jpg':
          return 'jpg';
        case 'png':
          return 'png';
        case 'gif':
          return 'gif';
        case 'webp':
          return 'webp';
        default:
          return 'jpg';
      }
    }
    return 'jpg';
  }

  isValidImageUrl(url) {
    return url && (url.startsWith('/images/') || url.startsWith('http'));
  }

  isBase64Image(data) {
    return data && data.startsWith('data:image/');
  }
}

module.exports = new ImageService();