/**
 * Generate a unique filename for uploaded files
 * @param {string} originalName - Original filename
 * @param {string} prefix - Prefix for the filename
 * @return {string} - Generated filename
 */
const generateFileName = (originalName, prefix = 'file') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split('.').pop();
  return `${prefix}-${timestamp}-${random}.${extension}`;
};

/**
 * Format file size in human readable format
 * @param {number} bytes - File size in bytes
 * @return {string} - Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Validate image file type
 * @param {string} mimetype - File mimetype
 * @return {boolean} - True if valid image type
 */
const isValidImageType = (mimetype) => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  return validTypes.includes(mimetype);
};

/**
 * Generate a random string
 * @param {number} length - Length of the string
 * @return {string} - Random string
 */
const generateRandomString = (length = 10) => {
  return Math.random().toString(36).substring(2, length + 2);
};

/**
 * Sanitize filename by removing special characters
 * @param {string} filename - Original filename
 * @return {string} - Sanitized filename
 */
const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase();
};

module.exports = {
  generateFileName,
  formatFileSize,
  isValidImageType,
  generateRandomString,
  sanitizeFilename
};