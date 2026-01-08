const Order = require('../models/Order');
const logger = require('../utils/logger');

// Create new order
const createOrder = async (req, res, next) => {
  try {
    const orderData = {
      userId: req.user?.uid || null, // From auth middleware (optional for guest checkout)
      userEmail: req.body.userEmail,
      userName: req.body.userName,
      items: req.body.items,
      totalAmount: req.body.totalAmount,
      shippingAddress: req.body.shippingAddress,
      phone: req.body.phone,
      paymentMethod: req.body.paymentMethod,
      notes: req.body.notes
    };

    const order = await Order.create(orderData);

    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully'
    });
  } catch (error) {
    logger.error('Error in createOrder:', error);
    next(error);
  }
};

// Get all orders (admin only)
const getAllOrders = async (req, res, next) => {
  try {
    const filters = {
      orderStatus: req.query.orderStatus,
      paymentStatus: req.query.paymentStatus,
      limit: req.query.limit
    };

    const orders = await Order.findAll(filters);

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    logger.error('Error in getAllOrders:', error);
    next(error);
  }
};

// Get order by ID
const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if user is admin or order owner
    if (!req.user?.isAdmin && req.user?.uid !== order.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this order'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    logger.error('Error in getOrderById:', error);
    next(error);
  }
};

// Get user's orders
const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.params.userId;

    // Check if user is admin or requesting their own orders
    if (!req.user?.isAdmin && req.user?.uid !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view these orders'
      });
    }

    const orders = await Order.findByUserId(userId);

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    logger.error('Error in getUserOrders:', error);
    next(error);
  }
};

// Update order status (admin only)
const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.updateOrderStatus(orderId, status);

    res.status(200).json({
      success: true,
      data: order,
      message: `Order status updated to ${status}`
    });
  } catch (error) {
    logger.error('Error in updateOrderStatus:', error);
    next(error);
  }
};

// Update payment status (admin only)
const updatePaymentStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'completed', 'failed', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.updatePaymentStatus(orderId, status);

    res.status(200).json({
      success: true,
      data: order,
      message: `Payment status updated to ${status}`
    });
  } catch (error) {
    logger.error('Error in updatePaymentStatus:', error);
    next(error);
  }
};

// Get order statistics (admin only)
const getOrderStats = async (req, res, next) => {
  try {
    const stats = await Order.getStats();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error in getOrderStats:', error);
    next(error);
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getOrderById,
  getUserOrders,
  updateOrderStatus,
  updatePaymentStatus,
  getOrderStats
};
