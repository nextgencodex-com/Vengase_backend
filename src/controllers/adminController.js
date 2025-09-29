const { getAuth } = require('../../config/firebase');
const Admin = require('../models/Admin');
const logger = require('../utils/logger');

// @desc    Create admin user
// @route   POST /api/v1/admin/create-admin
// @access  Public (for initial setup)
const createAdmin = async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Create user in Firebase Auth
    const userRecord = await getAuth().createUser({
      email: email,
      password: password,
      displayName: displayName || 'Admin User',
      emailVerified: true
    });

    // Set admin custom claims
    await getAuth().setCustomUserClaims(userRecord.uid, { 
      admin: true,
      role: 'admin',
      createdAt: new Date().toISOString()
    });

    // Create admin profile in database
    const adminData = await Admin.create({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName || 'Admin User',
      emailVerified: userRecord.emailVerified
    });

    logger.info(`Admin user created: ${email} (${userRecord.uid})`);

    res.status(201).json({
      success: true,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        admin: true,
        profile: adminData,
        message: 'Admin user created successfully'
      }
    });
  } catch (error) {
    logger.error('Error creating admin user:', error);
    
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({
        success: false,
        error: 'Email already exists'
      });
    }
    
    if (error.code === 'auth/invalid-email') {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
    }
    
    if (error.code === 'auth/weak-password') {
      return res.status(400).json({
        success: false,
        error: 'Password should be at least 6 characters'
      });
    }
    
    next(error);
  }
};

// @desc    Make existing user admin
// @route   POST /api/v1/admin/make-admin
// @access  Private (Admin only)
const makeAdmin = async (req, res, next) => {
  try {
    const { uid, email } = req.body;

    if (!uid && !email) {
      return res.status(400).json({
        success: false,
        error: 'User UID or email is required'
      });
    }

    let userRecord;
    if (uid) {
      userRecord = await getAuth().getUser(uid);
    } else {
      userRecord = await getAuth().getUserByEmail(email);
    }

    // Set admin custom claims
    await getAuth().setCustomUserClaims(userRecord.uid, { 
      admin: true,
      role: 'admin',
      promotedAt: new Date().toISOString()
    });

    // Create or update admin profile in database
    let adminData;
    try {
      adminData = await Admin.findByUid(userRecord.uid);
      if (!adminData) {
        adminData = await Admin.create({
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName || 'Admin User',
          emailVerified: userRecord.emailVerified
        });
      } else {
        adminData = await Admin.update(userRecord.uid, {
          status: 'active',
          role: 'admin'
        });
      }
    } catch (error) {
      logger.error('Error creating admin profile:', error);
      // Continue without failing the request
    }

    logger.info(`User promoted to admin: ${userRecord.email} (${userRecord.uid})`);

    res.status(200).json({
      success: true,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        admin: true,
        profile: adminData,
        message: 'User promoted to admin successfully'
      }
    });
  } catch (error) {
    logger.error('Error making user admin:', error);
    
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    next(error);
  }
};

// @desc    List all admin users
// @route   GET /api/v1/admin/list
// @access  Private (Admin only)
const listAdmins = async (req, res, next) => {
  try {
    const listUsersResult = await getAuth().listUsers(1000);
    
    const adminUsers = [];
    
    for (const userRecord of listUsersResult.users) {
      const user = await getAuth().getUser(userRecord.uid);
      if (user.customClaims && user.customClaims.admin) {
        adminUsers.push({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          disabled: user.disabled,
          createdAt: user.metadata.creationTime,
          lastSignIn: user.metadata.lastSignInTime,
          customClaims: user.customClaims
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        admins: adminUsers,
        count: adminUsers.length
      }
    });
  } catch (error) {
    logger.error('Error listing admin users:', error);
    next(error);
  }
};

// @desc    Remove admin privileges
// @route   POST /api/v1/admin/remove-admin
// @access  Private (Admin only)
const removeAdmin = async (req, res, next) => {
  try {
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json({
        success: false,
        error: 'User UID is required'
      });
    }

    // Check if user exists
    const userRecord = await getAuth().getUser(uid);

    // Remove admin custom claims
    await getAuth().setCustomUserClaims(uid, { 
      admin: false,
      role: 'user',
      demotedAt: new Date().toISOString()
    });

    logger.info(`Admin privileges removed: ${userRecord.email} (${uid})`);

    res.status(200).json({
      success: true,
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        admin: false,
        message: 'Admin privileges removed successfully'
      }
    });
  } catch (error) {
    logger.error('Error removing admin privileges:', error);
    
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    next(error);
  }
};

// @desc    Verify admin token and get user info
// @route   GET /api/v1/admin/verify
// @access  Private (Admin only)
const verifyAdmin = async (req, res, next) => {
  try {
    let adminProfile = null;
    
    // Try to update last login time (non-critical)
    try {
      await Admin.updateLastLogin(req.user.uid);
    } catch (error) {
      logger.warn('Could not update last login:', error.message);
    }
    
    // Try to get admin profile from database (non-critical)
    try {
      adminProfile = await Admin.findByUid(req.user.uid);
      
      // If no profile exists, create one
      if (!adminProfile) {
        adminProfile = await Admin.create({
          uid: req.user.uid,
          email: req.user.email,
          displayName: req.user.name || req.user.email.split('@')[0],
          emailVerified: req.user.email_verified || false
        });
        logger.info(`Created admin profile for: ${req.user.email}`);
      }
    } catch (error) {
      logger.warn('Could not get/create admin profile:', error.message);
    }
    
    res.status(200).json({
      success: true,
      data: {
        uid: req.user.uid,
        email: req.user.email,
        admin: true, // If we got here, user is admin
        role: req.user.role || 'admin',
        profile: adminProfile,
        verified: true,
        message: 'Admin verified successfully'
      }
    });
  } catch (error) {
    logger.error('Error verifying admin:', error);
    next(error);
  }
};

// @desc    Get admin statistics
// @route   GET /api/v1/admin/stats
// @access  Private (Admin only)
const getAdminStats = async (req, res, next) => {
  try {
    const stats = await Admin.getAdminStats();
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting admin stats:', error);
    next(error);
  }
};

module.exports = {
  createAdmin,
  makeAdmin,
  listAdmins,
  removeAdmin,
  verifyAdmin,
  getAdminStats
};