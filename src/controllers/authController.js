const { getAuth } = require('../../config/firebase');
const User = require('../models/User');
const logger = require('../utils/logger');

// @desc    Register new user (create profile after Firebase auth)
// @route   POST /api/v1/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
  try {
    const { uid, email, firstName, lastName, displayName, phone } = req.body;

    if (!uid || !email) {
      return res.status(400).json({
        success: false,
        error: 'UID and email are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.getByUid(uid);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User profile already exists'
      });
    }

    // Create user profile
    const userData = {
      uid,
      email,
      firstName: firstName || '',
      lastName: lastName || '',
      displayName: displayName || `${firstName || ''} ${lastName || ''}`.trim(),
      phone: phone || ''
    };

    const user = await User.create(userData);

    logger.info(`User registered: ${uid}`);

    res.status(201).json({
      success: true,
      data: {
        uid: user.uid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        phone: user.phone
      }
    });

  } catch (error) {
    logger.error('Error in registerUser:', error);
    next(error);
  }
};

// @desc    Sign in user (check if profile exists, create if not)
// @route   POST /api/v1/auth/signin
// @access  Public  
const signInUser = async (req, res, next) => {
  try {
    const { uid, email, displayName } = req.body;

    if (!uid || !email) {
      return res.status(400).json({
        success: false,
        error: 'UID and email are required'
      });
    }

    // Check if user profile exists
    let user = await User.getByUid(uid);
    
    if (!user) {
      // Create basic profile if it doesn't exist
      const userData = {
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        firstName: '',
        lastName: '',
        phone: ''
      };
      
      user = await User.create(userData);
      logger.info(`User profile created on sign in: ${uid}`);
    }

    res.status(200).json({
      success: true,
      data: {
        uid: user.uid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        phone: user.phone,
        cart: user.cart || [],
        wishlist: user.wishlist || []
      }
    });

  } catch (error) {
    logger.error('Error in signInUser:', error);
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/v1/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, displayName, phone, preferences } = req.body;
    const uid = req.user.uid;

    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (phone !== undefined) updateData.phone = phone;
    if (preferences !== undefined) updateData.preferences = preferences;
    
    // If displayName is not provided but firstName/lastName are, generate it
    if (!displayName && (firstName || lastName)) {
      updateData.displayName = `${firstName || ''} ${lastName || ''}`.trim();
    }

    const updatedUser = await User.update(uid, updateData);

    res.status(200).json({
      success: true,
      data: updatedUser
    });

  } catch (error) {
    logger.error('Error in updateProfile:', error);
    next(error);
  }
};

// @desc    Sync cart with database
// @route   POST /api/v1/auth/sync-cart
// @access  Private
const syncCart = async (req, res, next) => {
  try {
    const { cart } = req.body;
    const uid = req.user.uid;

    await User.updateCart(uid, cart || []);

    res.status(200).json({
      success: true,
      message: 'Cart synced successfully'
    });

  } catch (error) {
    logger.error('Error in syncCart:', error);
    next(error);
  }
};

// @desc    Sync wishlist with database
// @route   POST /api/v1/auth/sync-wishlist
// @access  Private
const syncWishlist = async (req, res, next) => {
  try {
    const { wishlist } = req.body;
    const uid = req.user.uid;

    await User.updateWishlist(uid, wishlist || []);

    res.status(200).json({
      success: true,
      message: 'Wishlist synced successfully'
    });

  } catch (error) {
    logger.error('Error in syncWishlist:', error);
    next(error);
  }
};

// @desc    Add item to cart
// @route   POST /api/v1/auth/cart/add
// @access  Private
const addToCart = async (req, res, next) => {
  try {
    const { product, size, quantity } = req.body;
    const uid = req.user.uid;

    if (!product || !size) {
      return res.status(400).json({
        success: false,
        error: 'Product and size are required'
      });
    }

    const cartItem = {
      ...product,
      size,
      quantity: quantity || 1
    };

    const updatedCart = await User.addToCart(uid, cartItem);

    res.status(200).json({
      success: true,
      data: {
        cart: updatedCart
      }
    });

  } catch (error) {
    logger.error('Error in addToCart:', error);
    next(error);
  }
};

// @desc    Toggle wishlist item
// @route   POST /api/v1/auth/wishlist/toggle
// @access  Private
const toggleWishlist = async (req, res, next) => {
  try {
    const { productId } = req.body;
    const uid = req.user.uid;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'Product ID is required'
      });
    }

    const updatedWishlist = await User.toggleWishlist(uid, productId);

    res.status(200).json({
      success: true,
      data: {
        wishlist: updatedWishlist
      }
    });

  } catch (error) {
    logger.error('Error in toggleWishlist:', error);
    next(error);
  }
};

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
    const uid = req.user.uid;

    // Get full user profile from database
    const userProfile = await User.getByUid(uid);
    
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found'
      });
    }

    res.status(200).json({
      success: true,
      data: userProfile
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

// @desc    Get all users (admin only)
// @route   GET /api/v1/auth/users
// @access  Private (Admin)
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.getAll();
    
    logger.info(`Admin retrieved ${users.length} users`);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });

  } catch (error) {
    logger.error('Error in getAllUsers:', error);
    next(error);
  }
};

// @desc    Delete user (admin only)
// @route   DELETE /api/v1/auth/users/:uid
// @access  Private (Admin)
const deleteUser = async (req, res, next) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Soft delete the user in database
    await User.delete(uid);
    
    // Optionally, you can also disable the user in Firebase Auth
    // await getAuth().updateUser(uid, { disabled: true });

    logger.info(`User deleted: ${uid}`);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    logger.error('Error in deleteUser:', error);
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
  registerUser,
  signInUser,
  updateProfile,
  syncCart,
  syncWishlist,
  addToCart,
  toggleWishlist,
  createAdmin,
  verifyAdmin,
  getProfile,
  revokeAdmin,
  getAllUsers,
  deleteUser
};