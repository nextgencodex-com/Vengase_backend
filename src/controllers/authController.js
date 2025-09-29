const { getAuth } = require('../../config/firebase');
const logger = require('../utils/logger');

// @desc    Create admin user
// @route   POST /api/v1/auth/create-admin
// @access  Private (Super Admin)
const createAdmin = async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Create user
    const userRecord = await getAuth().createUser({
      email,
      password,
      displayName,
      emailVerified: true
    });

    // Set admin custom claims
    await getAuth().setCustomUserClaims(userRecord.uid, { admin: true });

    logger.info(`Admin user created: ${userRecord.uid}`);

    res.status(201).json({
      success: true,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        admin: true
      }
    });

  } catch (error) {
    logger.error('Error in createAdmin:', error);
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({
        success: false,
        error: 'Email already exists'
      });
    }
    next(error);
  }
};

// @desc    Verify admin token
// @route   GET /api/v1/auth/verify-admin
// @access  Private
const verifyAdmin = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user.admin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        uid: user.uid,
        email: user.email,
        admin: user.admin
      }
    });

  } catch (error) {
    logger.error('Error in verifyAdmin:', error);
    next(error);
  }
};

// @desc    Get user profile
// @route   GET /api/v1/auth/profile
// @access  Private
const getProfile = async (req, res, next) => {
  try {
    const user = req.user;

    res.status(200).json({
      success: true,
      data: {
        uid: user.uid,
        email: user.email,
        name: user.name,
        admin: user.admin || false
      }
    });

  } catch (error) {
    logger.error('Error in getProfile:', error);
    next(error);
  }
};

// @desc    Revoke admin access
// @route   POST /api/v1/auth/revoke-admin
// @access  Private (Super Admin)
const revokeAdmin = async (req, res, next) => {
  try {
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Remove admin custom claims
    await getAuth().setCustomUserClaims(uid, { admin: false });

    logger.info(`Admin access revoked for user: ${uid}`);

    res.status(200).json({
      success: true,
      message: 'Admin access revoked successfully'
    });

  } catch (error) {
    logger.error('Error in revokeAdmin:', error);
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    next(error);
  }
};

module.exports = {
  createAdmin,
  verifyAdmin,
  getProfile,
  revokeAdmin
};