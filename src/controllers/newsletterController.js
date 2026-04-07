const Newsletter = require('../models/Newsletter');
const logger = require('../utils/logger');

const newsletter = new Newsletter();

// Subscribe to newsletter
const subscribe = async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim();

    // Validate email
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const result = await newsletter.subscribe(email);

    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        message: result.message 
      });
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data
    });

    logger.info(`New newsletter subscription: ${email}`);
  } catch (error) {
    logger.error('Error in subscribe:', error);
    next(error);
  }
};

// Get all newsletter subscriptions (admin only)
const getSubscriptions = async (req, res, next) => {
  try {
    const subscriptions = await newsletter.getAll();
    res.status(200).json({
      success: true,
      data: subscriptions,
      count: subscriptions.length
    });
  } catch (error) {
    logger.error('Error in getSubscriptions:', error);
    next(error);
  }
};

// Delete newsletter subscription (admin only)
const deleteSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    // Check if subscription exists
    let targetId = id;
    let existing = await newsletter.getById(id);
    
    if (!existing) {
      // Express auto-decodes path params, so "test%40email.com" becomes "test@email.com". 
      // Re-encode it because the Firestore doc ID is literal "test%40email.com"
      const encodedId = encodeURIComponent(id);
      existing = await newsletter.getById(encodedId);
      if (existing) {
        targetId = encodedId;
      }
    }

    if (!existing) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    await newsletter.delete(targetId);
    res.status(200).json({
      success: true,
      message: 'Subscription deleted successfully'
    });
  } catch (error) {
    logger.error('Error in deleteSubscription:', error);
    next(error);
  }
};

// Export subscriptions as CSV (admin only)
const exportSubscriptions = async (req, res, next) => {
  try {
    const subscriptions = await newsletter.exportAllAsArray();

    if (subscriptions.length === 0) {
      return res.status(400).json({ error: 'No subscriptions to export' });
    }

    // Create CSV content
    const headers = ['Email', 'Subscribed Date', 'Status'];
    const csvContent = [
      headers.join(','),
      ...subscriptions.map(sub =>
        `"${sub.Email}","${sub['Subscribed Date']}","${sub.Status}"`
      )
    ].join('\n');

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="newsletter-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

    logger.info(`Newsletter subscriptions exported: ${subscriptions.length} records`);
  } catch (error) {
    logger.error('Error in exportSubscriptions:', error);
    next(error);
  }
};

module.exports = {
  subscribe,
  getSubscriptions,
  deleteSubscription,
  exportSubscriptions
};
