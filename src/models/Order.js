const { getFirestore } = require('../../config/firebase');
const logger = require('../utils/logger');

class Order {
  constructor() {
    this.collection = 'orders';
  }

  // Generate unique order ID (format: ORD-20260108-XXXXX)
  async generateOrderId() {
    try {
      const db = getFirestore();
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
      
      // Find the highest order number for today
      const snapshot = await db.collection(this.collection)
        .where('orderId', '>=', `ORD-${dateStr}-00000`)
        .where('orderId', '<=', `ORD-${dateStr}-99999`)
        .orderBy('orderId', 'desc')
        .limit(1)
        .get();
      
      let orderNumber = 1;
      if (!snapshot.empty) {
        const lastOrderId = snapshot.docs[0].data().orderId;
        const lastNumber = parseInt(lastOrderId.split('-')[2]);
        orderNumber = lastNumber + 1;
      }
      
      // Format: ORD-20260108-00001
      const orderId = `ORD-${dateStr}-${orderNumber.toString().padStart(5, '0')}`;
      logger.info(`Generated order ID: ${orderId}`);
      return orderId;
    } catch (error) {
      logger.error('Error generating order ID:', error);
      // Fallback to timestamp-based ID
      return `ORD-${Date.now()}`;
    }
  }

  async create(orderData) {
    try {
      const db = getFirestore();
      
      // Generate unique order ID
      const orderId = await this.generateOrderId();
      
      const order = {
        orderId,
        userId: orderData.userId || null,
        userEmail: orderData.userEmail,
        userName: orderData.userName,
        items: orderData.items || [],
        totalAmount: parseFloat(orderData.totalAmount),
        shippingAddress: orderData.shippingAddress,
        phone: orderData.phone,
        paymentMethod: orderData.paymentMethod || 'pending',
        paymentStatus: 'pending', // pending, completed, failed
        orderStatus: 'pending', // pending, confirmed, processing, shipped, delivered, cancelled
        notes: orderData.notes || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Use orderId as document ID for easy retrieval
      const orderRef = db.collection(this.collection).doc(orderId);
      await orderRef.set(order);
      
      logger.info(`Order created: ${orderId}`);
      return order;
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  async findById(orderId) {
    try {
      const db = getFirestore();
      const doc = await db.collection(this.collection).doc(orderId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return doc.data();
    } catch (error) {
      logger.error('Error finding order by ID:', error);
      throw error;
    }
  }

  async findAll(filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection(this.collection);

      // Apply filters
      if (filters.orderStatus) {
        query = query.where('orderStatus', '==', filters.orderStatus);
      }

      if (filters.paymentStatus) {
        query = query.where('paymentStatus', '==', filters.paymentStatus);
      }

      if (filters.userId) {
        query = query.where('userId', '==', filters.userId);
      }

      // Order by creation date (most recent first)
      query = query.orderBy('createdAt', 'desc');

      if (filters.limit) {
        query = query.limit(parseInt(filters.limit));
      }

      const snapshot = await query.get();
      const orders = [];
      
      snapshot.forEach(doc => {
        orders.push(doc.data());
      });

      return orders;
    } catch (error) {
      logger.error('Error finding orders:', error);
      throw error;
    }
  }

  async findByUserId(userId) {
    try {
      return await this.findAll({ userId });
    } catch (error) {
      logger.error('Error finding orders by user ID:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, status) {
    try {
      const db = getFirestore();
      const orderRef = db.collection(this.collection).doc(orderId);
      
      const doc = await orderRef.get();
      if (!doc.exists) {
        throw new Error('Order not found');
      }

      await orderRef.update({
        orderStatus: status,
        updatedAt: new Date()
      });

      logger.info(`Order ${orderId} status updated to: ${status}`);
      
      const updatedDoc = await orderRef.get();
      return updatedDoc.data();
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  async updatePaymentStatus(orderId, status) {
    try {
      const db = getFirestore();
      const orderRef = db.collection(this.collection).doc(orderId);
      
      const doc = await orderRef.get();
      if (!doc.exists) {
        throw new Error('Order not found');
      }

      await orderRef.update({
        paymentStatus: status,
        updatedAt: new Date()
      });

      logger.info(`Order ${orderId} payment status updated to: ${status}`);
      
      const updatedDoc = await orderRef.get();
      return updatedDoc.data();
    } catch (error) {
      logger.error('Error updating payment status:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(this.collection).get();
      
      let totalOrders = 0;
      let totalRevenue = 0;
      let pendingOrders = 0;
      let completedOrders = 0;
      let cancelledOrders = 0;

      snapshot.forEach(doc => {
        const order = doc.data();
        totalOrders++;
        totalRevenue += order.totalAmount;

        if (order.orderStatus === 'pending' || order.orderStatus === 'confirmed') {
          pendingOrders++;
        } else if (order.orderStatus === 'delivered') {
          completedOrders++;
        } else if (order.orderStatus === 'cancelled') {
          cancelledOrders++;
        }
      });

      return {
        totalOrders,
        totalRevenue,
        pendingOrders,
        completedOrders,
        cancelledOrders
      };
    } catch (error) {
      logger.error('Error getting order stats:', error);
      throw error;
    }
  }
}

module.exports = new Order();
