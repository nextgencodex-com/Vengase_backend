const admin = require('firebase-admin');
const logger = require('../utils/logger');

// Authenticate Firebase token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const token = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (error) {
      logger.error('Token verification failed:', error);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Check if user has admin custom claim
    const userRecord = await admin.auth().getUser(req.user.uid);
    
    if (userRecord.customClaims?.admin === true || userRecord.customClaims?.isAdmin === true) {
      req.user.isAdmin = true;
      next();
    } else {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
  } catch (error) {
    logger.error('Admin check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authorization check failed'
    });
  }
};

// Optional authentication - sets user if token exists but doesn't require it
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
      } catch (error) {
        // Token invalid but we don't fail - just continue without user
        logger.debug('Optional auth: Invalid token, continuing without user');
      }
    }
    
    next();
  } catch (error) {
    logger.error('Optional auth error:', error);
    next();
  }
};

module.exports = {
  authenticateToken,
  isAdmin,
  optionalAuth
};
