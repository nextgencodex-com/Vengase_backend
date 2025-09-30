const { getFirestore } = require('../../config/firebase');
const logger = require('../utils/logger');

class User {
  constructor() {
    this.db = null;
    this.collection = 'users';
  }

  // Lazy initialization of Firestore
  getDb() {
    if (!this.db) {
      this.db = getFirestore();
    }
    return this.db;
  }

  // Create a new user profile
  async create(userData) {
    try {
      const userDoc = {
        uid: userData.uid,
        email: userData.email,
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        displayName: userData.displayName || '',
        phone: userData.phone || '',
        cart: [],
        wishlist: [],
        orders: [],
        addresses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        preferences: {
          notifications: true,
          newsletter: false
        }
      };

      await this.getDb().collection(this.collection).doc(userData.uid).set(userDoc);
      logger.info(`User profile created: ${userData.uid}`);
      return userDoc;
    } catch (error) {
      logger.error('Error creating user profile:', error);
      throw error;
    }
  }

  // Get user by UID
  async getByUid(uid) {
    try {
      const doc = await this.getDb().collection(this.collection).doc(uid).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      logger.error('Error getting user by UID:', error);
      throw error;
    }
  }

  // Get user by email
  async getByEmail(email) {
    try {
      const snapshot = await this.getDb().collection(this.collection)
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      logger.error('Error getting user by email:', error);
      throw error;
    }
  }

  // Get all users (admin only)
  async getAll() {
    try {
      // Simple query without compound index requirement
      const snapshot = await this.getDb().collection(this.collection).get();
      
      const users = [];
      snapshot.forEach(doc => {
        const userData = doc.data();
        // Filter active users in memory instead of in query
        if (userData.isActive !== false) { // Include users where isActive is true or undefined
          users.push({
            id: doc.id,
            uid: userData.uid,
            email: userData.email,
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            displayName: userData.displayName || '',
            phone: userData.phone || '',
            createdAt: userData.createdAt,
            isActive: userData.isActive !== false,
            orderCount: userData.orders ? userData.orders.length : 0,
            // Don't return sensitive data like cart, wishlist details
          });
        }
      });
      
      // Sort by creation date in memory (newest first)
      users.sort((a, b) => {
        const aDate = a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(0);
        const bDate = b.createdAt?.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(0);
        return bDate - aDate;
      });
      
      return users;
    } catch (error) {
      logger.error('Error getting all users:', error);
      throw error;
    }
  }

  // Update user profile
  async update(uid, updateData) {
    try {
      const updatedData = {
        ...updateData,
        updatedAt: new Date()
      };
      
      await this.getDb().collection(this.collection).doc(uid).update(updatedData);
      logger.info(`User profile updated: ${uid}`);
      return await this.getByUid(uid);
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw error;
    }
  }

  // Update user cart
  async updateCart(uid, cart) {
    try {
      await this.getDb().collection(this.collection).doc(uid).update({
        cart: cart,
        updatedAt: new Date()
      });
      logger.info(`User cart updated: ${uid}`);
      return true;
    } catch (error) {
      logger.error('Error updating user cart:', error);
      throw error;
    }
  }

  // Update user wishlist
  async updateWishlist(uid, wishlist) {
    try {
      await this.getDb().collection(this.collection).doc(uid).update({
        wishlist: wishlist,
        updatedAt: new Date()
      });
      logger.info(`User wishlist updated: ${uid}`);
      return true;
    } catch (error) {
      logger.error('Error updating user wishlist:', error);
      throw error;
    }
  }

  // Add item to cart
  async addToCart(uid, cartItem) {
    try {
      const user = await this.getByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      const existingCart = user.cart || [];
      const existingItemIndex = existingCart.findIndex(
        item => item.id === cartItem.id && item.size === cartItem.size
      );

      if (existingItemIndex >= 0) {
        // Update quantity of existing item
        existingCart[existingItemIndex].quantity += cartItem.quantity || 1;
        existingCart[existingItemIndex].updatedAt = new Date();
      } else {
        // Add new item
        existingCart.push({
          ...cartItem,
          addedAt: new Date(),
          updatedAt: new Date()
        });
      }

      await this.updateCart(uid, existingCart);
      return existingCart;
    } catch (error) {
      logger.error('Error adding to user cart:', error);
      throw error;
    }
  }

  // Remove item from cart
  async removeFromCart(uid, productId, size) {
    try {
      const user = await this.getByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      const updatedCart = (user.cart || []).filter(
        item => !(item.id === productId && item.size === size)
      );

      await this.updateCart(uid, updatedCart);
      return updatedCart;
    } catch (error) {
      logger.error('Error removing from user cart:', error);
      throw error;
    }
  }

  // Add/Remove item from wishlist
  async toggleWishlist(uid, productId) {
    try {
      const user = await this.getByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      const existingWishlist = user.wishlist || [];
      const isInWishlist = existingWishlist.includes(productId);
      
      const updatedWishlist = isInWishlist
        ? existingWishlist.filter(id => id !== productId)
        : [...existingWishlist, productId];

      await this.updateWishlist(uid, updatedWishlist);
      return updatedWishlist;
    } catch (error) {
      logger.error('Error toggling user wishlist:', error);
      throw error;
    }
  }

  // Add order to user
  async addOrder(uid, orderData) {
    try {
      const user = await this.getByUid(uid);
      if (!user) {
        throw new Error('User not found');
      }

      const existingOrders = user.orders || [];
      const newOrder = {
        ...orderData,
        id: `order_${Date.now()}`,
        createdAt: new Date(),
        status: 'pending'
      };

      existingOrders.push(newOrder);

      await this.getDb().collection(this.collection).doc(uid).update({
        orders: existingOrders,
        updatedAt: new Date()
      });

      logger.info(`Order added for user: ${uid}`);
      return newOrder;
    } catch (error) {
      logger.error('Error adding user order:', error);
      throw error;
    }
  }

  // Get user statistics
  async getStats() {
    try {
      const snapshot = await this.getDb().collection(this.collection).get();
      const totalUsers = snapshot.size;
      
      let activeUsers = 0;
      let totalOrders = 0;
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.isActive) activeUsers++;
        if (data.orders) totalOrders += data.orders.length;
      });

      return {
        totalUsers,
        activeUsers,
        totalOrders
      };
    } catch (error) {
      logger.error('Error getting user stats:', error);
      throw error;
    }
  }

  // Delete user (soft delete)
  async delete(uid) {
    try {
      await this.getDb().collection(this.collection).doc(uid).update({
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date()
      });
      logger.info(`User soft deleted: ${uid}`);
      return true;
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }
}

module.exports = new User();