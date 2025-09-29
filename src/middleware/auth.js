const { getAuth } = require('../../config/firebase');
const logger = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      logger.warn('Authentication failed: No token provided');
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify Firebase ID token
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    
    logger.debug(`Token verified for user: ${decodedToken.email} (${decodedToken.uid})`);
    next();
  } catch (error) {
    logger.error('Authentication error:', {
      error: error.message,
      code: error.code,
      tokenPreview: req.headers.authorization ? req.headers.authorization.substring(0, 20) + '...' : 'none'
    });
    
    let errorMessage = 'Invalid or expired token';
    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Token expired';
    } else if (error.code === 'auth/argument-error') {
      errorMessage = 'Invalid token format';
    }
    
    return res.status(403).json({
      success: false,
      error: errorMessage
    });
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // List of known admin emails (fallback)
    const ADMIN_EMAILS = [
      'admin@vengase.com',
      'test@admin.vengase.com'
    ];

    // Check if user has admin custom claims OR is in admin email list
    const hasAdminClaim = req.user.admin === true;
    const isAdminEmail = ADMIN_EMAILS.includes(req.user.email);

    if (!hasAdminClaim && !isAdminEmail) {
      logger.warn(`Access denied for user: ${req.user.email} (UID: ${req.user.uid})`);
      logger.debug('User claims:', req.user);
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // If user is admin by email but doesn't have claims, set them
    if (isAdminEmail && !hasAdminClaim) {
      try {
        await getAuth().setCustomUserClaims(req.user.uid, { 
          admin: true,
          role: 'admin',
          grantedAt: new Date().toISOString()
        });
        logger.info(`Admin claims granted to: ${req.user.email}`);
      } catch (claimError) {
        logger.warn('Failed to set admin claims:', claimError);
        // Continue anyway since email is in admin list
      }
    }

    next();
  } catch (error) {
    logger.error('Admin check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authorization check failed'
    });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin
};