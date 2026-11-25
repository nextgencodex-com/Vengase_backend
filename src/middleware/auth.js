const { getAuth } = require('../../config/firebase');
const logger = require('../utils/logger');
const { auditLog } = require('../utils/auditLogger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!token) {
      logger.warn(`Authentication failed: No token provided (${req.method} ${req.originalUrl})`);
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
    logger.warn('Authentication error:', {
      code: error.code,
      path: req.originalUrl
    });

    let errorMessage = 'Invalid or expired token';
    if (error.code === 'auth/id-token-expired') {
      errorMessage = 'Token expired';
    } else if (error.code === 'auth/argument-error') {
      errorMessage = 'Invalid token format';
    }

    return res.status(401).json({
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

    // Verify live custom claims against Firebase Auth so revoked admins are rejected immediately
    const userRecord = await getAuth().getUser(req.user.uid);
    const hasAdminClaim = userRecord.customClaims?.admin === true || userRecord.customClaims?.isAdmin === true;

    if (!hasAdminClaim) {
      auditLog('ADMIN_ACCESS_DENIED', {
        actor: req.user,
        ip: req.ip,
        target: `${req.method} ${req.originalUrl}`,
        outcome: 'denied'
      });
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    req.user.isAdmin = true;
    req.user.admin = true;
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