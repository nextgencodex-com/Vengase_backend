const { getFirestore } = require('../../config/firebase');
const logger = require('../utils/logger');

class Newsletter {
  constructor() {
    this.db = null;
    this.collection = 'newsletter_subscriptions';
  }

  // Lazy initialization of Firestore
  getDb() {
    if (!this.db) {
      this.db = getFirestore();
    }
    return this.db;
  }

  // Subscribe email to newsletter
  async subscribe(email) {
    try {
      // Check if email already exists
      const existingSnapshot = await this.getDb()
        .collection(this.collection)
        .where('email', '==', email)
        .get();

      if (!existingSnapshot.empty) {
        return {
          success: false,
          message: 'Email already subscribed to newsletter',
          data: existingSnapshot.docs[0].data()
        };
      }

      // Add new subscription
      const newSubscription = {
        email,
        subscribedAt: new Date(),
        updatedAt: new Date(),
        status: 'Active'
      };

      const docRef = await this.getDb()
        .collection(this.collection)
        .add(newSubscription);

      logger.info(`Newsletter subscription created: ${email}`);

      return {
        success: true,
        message: 'Successfully subscribed to newsletter',
        data: { id: docRef.id, ...newSubscription }
      };
    } catch (error) {
      logger.error('Error subscribing to newsletter:', error);
      throw error;
    }
  }

  // Get all newsletter subscriptions
  async getAll() {
    try {
      const snapshot = await this.getDb()
        .collection(this.collection)
        .orderBy('subscribedAt', 'desc')
        .get();

      const subscriptions = [];
      snapshot.forEach(doc => {
        subscriptions.push({
          id: doc.id,
          _id: doc.id,
          ...doc.data()
        });
      });

      logger.info(`Retrieved ${subscriptions.length} newsletter subscriptions`);

      return subscriptions;
    } catch (error) {
      logger.error('Error getting newsletter subscriptions:', error);
      throw error;
    }
  }

  // Get subscription by ID
  async getById(id) {
    try {
      const doc = await this.getDb()
        .collection(this.collection)
        .doc(id)
        .get();

      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        _id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      logger.error('Error getting newsletter subscription:', error);
      throw error;
    }
  }

  // Delete subscription
  async delete(id) {
    try {
      await this.getDb()
        .collection(this.collection)
        .doc(id)
        .delete();

      logger.info(`Newsletter subscription deleted: ${id}`);

      return { success: true, message: 'Subscription deleted successfully' };
    } catch (error) {
      logger.error('Error deleting newsletter subscription:', error);
      throw error;
    }
  }

  // Get subscriptions count
  async getCount() {
    try {
      const snapshot = await this.getDb()
        .collection(this.collection)
        .count()
        .get();

      return snapshot.data().count;
    } catch (error) {
      logger.error('Error getting newsletter subscription count:', error);
      throw error;
    }
  }

  // Search subscriptions by email
  async searchByEmail(email) {
    try {
      const snapshot = await this.getDb()
        .collection(this.collection)
        .where('email', '==', email)
        .get();

      const subscriptions = [];
      snapshot.forEach(doc => {
        subscriptions.push({
          id: doc.id,
          _id: doc.id,
          ...doc.data()
        });
      });

      return subscriptions;
    } catch (error) {
      logger.error('Error searching newsletter subscriptions:', error);
      throw error;
    }
  }

  // Export all subscriptions as array for CSV
  async exportAllAsArray() {
    try {
      const subscriptions = await this.getAll();
      return subscriptions.map(sub => ({
        Email: sub.email,
        'Subscribed Date': sub.subscribedAt ? new Date(sub.subscribedAt.toDate()).toLocaleDateString() : '',
        Status: sub.status
      }));
    } catch (error) {
      logger.error('Error exporting newsletter subscriptions:', error);
      throw error;
    }
  }
}

module.exports = Newsletter;
