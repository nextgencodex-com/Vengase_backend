const { Resend } = require('resend');
const emailjs = require('@emailjs/nodejs');
const logger = require('./logger');
const Order = require('../models/Order');

// Use API key from environment only.
const resendApiKey = process.env.RESEND_API_KEY;
const resend = new Resend(resendApiKey);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'wevengase@gmail.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Vengase <orders@vengase.com>';
const RESEND_FALLBACK_FROM = process.env.RESEND_FALLBACK_FROM || 'onboarding@resend.dev';
const WEBSITE_LINK = process.env.WEBSITE_LINK || 'https://vengase.com';
const DEFAULT_LOGO_URL = `${WEBSITE_LINK.replace(/\/$/, '')}/images/logo.png`;
const LOGO_URL = process.env.EMAIL_LOGO_URL || DEFAULT_LOGO_URL;
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
};

const getItemsSubtotal = (items = []) => {
  return items.reduce((sum, item) => {
    const price = Number(item?.price || 0);
    const qty = Number(item?.quantity || item?.units || 1);
    return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(qty) ? qty : 1);
  }, 0);
};

const buildCustomerOrderTemplate = ({ orderId, customerEmail, items, deliveryFee, total }) => {
  const rows = (items || []).map((item) => {
    const imageUrl = item.img || item.imagePath || item.image || '/images/FeaturedProducts/prod1.png';
    return `
      <table style="width: 100%; border-collapse: collapse">
        <tr style="vertical-align: top">
          <td style="padding: 24px 8px 0 4px; display: inline-block; width: max-content">
            <img style="height: 64px" height="64px" src="${escapeHtml(imageUrl)}" alt="item" />
          </td>
          <td style="padding: 24px 8px 0 8px; width: 100%">
            <div>${escapeHtml(item.name || 'Item')}</div>
            <div style="font-size: 14px; color: #888; padding-top: 4px">QTY: ${escapeHtml(item.quantity || item.units || 1)}</div>
          </td>
          <td style="padding: 24px 4px 0 0; white-space: nowrap">
            <strong>$${formatCurrency(item.price)}</strong>
          </td>
        </tr>
      </table>
    `;
  }).join('');

  return `
<div
  style="
    font-family: system-ui, sans-serif, Arial;
    font-size: 14px;
    color: #333;
    padding: 14px 8px;
    background-color: #f5f5f5;
  "
>
  <div style="max-width: 600px; margin: auto; background-color: #fff">
    <div style="border-top: 6px solid #458500; padding: 16px">
      <a
        style="text-decoration: none; outline: none; margin-right: 8px; vertical-align: middle"
        href="${escapeHtml(WEBSITE_LINK)}"
        target="_blank"
      >
        <img
          style="height: 32px; vertical-align: middle"
          height="32px"
          src="${escapeHtml(LOGO_URL)}"
          alt="logo"
        />
      </a>
      <span
        style="
          font-size: 16px;
          vertical-align: middle;
          border-left: 1px solid #333;
          padding-left: 8px;
        "
      >
        <strong>Thank You for Your Order</strong>
      </span>
    </div>
    <div style="padding: 0 16px">
      <p>We'll send you tracking information when the order ships.</p>
      <div
        style="
          text-align: left;
          font-size: 14px;
          padding-bottom: 4px;
          border-bottom: 2px solid #333;
        "
      >
        <strong>Order # ${escapeHtml(orderId)}</strong>
      </div>
      ${rows}
      <div style="padding: 24px 0">
        <div style="border-top: 2px solid #333"></div>
      </div>
      <table style="border-collapse: collapse; width: 100%; text-align: right">
        <tr>
          <td style="width: 60%"></td>
          <td>Delivery Fee</td>
          <td style="padding: 8px; white-space: nowrap">$${formatCurrency(deliveryFee)}</td>
        </tr>
        <tr>
          <td style="width: 60%"></td>
          <td style="border-top: 2px solid #333">
            <strong style="white-space: nowrap">Order Total</strong>
          </td>
          <td style="padding: 16px 8px; border-top: 2px solid #333; white-space: nowrap">
            <strong>$${formatCurrency(total)}</strong>
          </td>
        </tr>
      </table>
    </div>
  </div>
  <div style="max-width: 600px; margin: auto">
    <p style="color: #999">
      The email was sent to ${escapeHtml(customerEmail)}<br />
      You received this email because you placed the order
    </p>
  </div>
</div>
`;
};

const assertResendSuccess = (response, label, recipient) => {
  if (!response) {
    throw new Error(`${label}: Empty response from Resend for ${recipient}`);
  }
  if (response.error) {
    const message = response.error.message || JSON.stringify(response.error);
    throw new Error(`${label}: ${message}`);
  }
  if (!response.data || !response.data.id) {
    throw new Error(`${label}: Missing message id for ${recipient}`);
  }
  return response.data.id;
};

const sendResendWithFallback = async ({ to, subject, html }) => {
  const primary = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html
  });

  if (primary?.error && String(primary.error.message || '').toLowerCase().includes('domain is not verified')) {
    logger.warn(`Primary Resend sender not verified for ${FROM_EMAIL}. Retrying with fallback sender.`);
    const fallback = await resend.emails.send({
      from: RESEND_FALLBACK_FROM,
      to,
      subject,
      html
    });
    return fallback;
  }

  return primary;
};

/**
 * Sends order confirmation email:
 * - Customer via EmailJS
 * - Admin via Resend
 * @param {String} orderId - Order ID
 */
const sendOrderConfirmationEmails = async (orderId) => {
  try {
    if (!resendApiKey && !EMAILJS_SERVICE_ID) {
      logger.error('Neither Resend nor EmailJS are fully configured. Email sending skipped.');
      return;
    }

    console.log(`[EmailService] Attempting to send confirmation for order: ${orderId}`);
    if (/localhost|127\.0\.0\.1/i.test(LOGO_URL)) {
      logger.warn(`EMAIL_LOGO_URL is set to a local URL (${LOGO_URL}). External inboxes cannot load localhost images.`);
    }
    const orderData = await Order.findById(orderId);

    if (!orderData) {
      logger.error(`Order ${orderId} not found, cannot send email.`);
      return;
    }

    console.log(`[EmailService] Found order data:`, JSON.stringify({
      userEmail: orderData.userEmail, 
      paymentMetaEmail: orderData.paymentMeta?.x_email,
      totalAmount: orderData.totalAmount
    }));

    const customerEmail = orderData.userEmail || orderData.paymentMeta?.x_email;
    const customerName = orderData.userName || orderData.paymentMeta?.x_first_name || 'Customer';
    const totalNumeric = Number(orderData.totalAmount || 0);
    const totalAmount = Number.isFinite(totalNumeric) ? `LKR ${totalNumeric.toFixed(2)}` : 'N/A';
    const itemsSubtotal = getItemsSubtotal(orderData.items || []);
    const explicitDeliveryFee = Number(orderData.deliveryFee ?? orderData.shippingAmount);
    const inferredDeliveryFee = Number.isFinite(totalNumeric)
      ? Math.max(0, totalNumeric - itemsSubtotal)
      : 0;
    const deliveryFee = Number.isFinite(explicitDeliveryFee) ? explicitDeliveryFee : inferredDeliveryFee;
    
    const itemsListHtml = orderData.items && orderData.items.length > 0
      ? `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="border-bottom: 1px solid #ddd; text-align: left;">
              <th style="padding: 8px;">Item</th>
              <th style="padding: 8px;">Qty</th>
              <th style="padding: 8px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${orderData.items.map(item => `
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${item.name || 'Item'}</td>
                <td style="padding: 8px;">${item.quantity || 1}</td>
                <td style="padding: 8px;">${item.price ? `LKR ${parseFloat(item.price).toFixed(2)}` : 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
      : '<p>Items specific details are not available or it is a generic checkout.</p>';

    const phone = orderData.phone || orderData.paymentMeta?.x_phone || 'Not provided';
    
    // shippingAddress is an object { address, city, postalCode, country }
    let address = 'Not provided';
    if (orderData.shippingAddress && typeof orderData.shippingAddress === 'object') {
       const addrObj = orderData.shippingAddress;
       address = `${addrObj.address || ''}, ${addrObj.city || ''}, ${addrObj.postalCode || ''}, ${addrObj.country || ''}`.replace(/,\s*,/g, ',').replace(/(^,\s*)|(\s*,\s*$)/g, '');
    } else if (orderData.shippingAddress) {
       address = orderData.shippingAddress;
    } else if (orderData.paymentMeta?.x_address) {
       address = orderData.paymentMeta.x_address;
    }

    const orderSummaryHtml = `
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Order Summary</h3>
        ${itemsListHtml}
        <p><strong>Items Subtotal:</strong> LKR ${formatCurrency(itemsSubtotal)}</p>
        <p><strong>Delivery Fee:</strong> LKR ${formatCurrency(deliveryFee)}</p>
        <p><strong>Total Amount:</strong> ${totalAmount}</p>
        <p><strong>Payment Method:</strong> ${orderData.paymentMethod ? orderData.paymentMethod.toUpperCase() : 'N/A'}</p>
        
        <h3 style="margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Shipping Details</h3>
        <p style="margin: 5px 0;"><strong>Name:</strong> ${customerName}</p>
        <p style="margin: 5px 0;"><strong>Email:</strong> ${customerEmail || 'Not provided'}</p>
        <p style="margin: 5px 0;"><strong>Phone:</strong> ${phone}</p>
        <p style="margin: 5px 0;"><strong>Address:</strong> ${address}</p>
      </div>
    `;

    // Build Email Subject and HTML for Customer
    const customerSubject = `Order Confirmation - #${orderId}`;
    const customerHtml = buildCustomerOrderTemplate({
      orderId,
      customerEmail: customerEmail || 'Not provided',
      items: orderData.items,
      deliveryFee,
      total: orderData.totalAmount || 0
    });

    const emailjsTemplateParams = {
      to_email: customerEmail,
      email: customerEmail,
      customer_email: customerEmail,
      customer_name: customerName,
      website_link: WEBSITE_LINK,
      logo_url: LOGO_URL,
      order_id: orderId,
      orders: (orderData.items || []).map((item) => ({
        image_url: item.img || item.imagePath || item.image || '/images/FeaturedProducts/prod1.png',
        name: item.name || 'Item',
        units: item.quantity || 1,
        price: formatCurrency(item.price)
      })),
      cost: {
        shipping: formatCurrency(deliveryFee),
        delivery_fee: formatCurrency(deliveryFee),
        tax: '',
        total: formatCurrency(orderData.totalAmount || 0)
      },
      message: customerHtml
    };

    // Try sending to Customer via EmailJS
    try {
      if (customerEmail && customerEmail !== 'customer@example.com') { // Prevent sending to dummy email
        if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
          throw new Error('EmailJS is not fully configured. Missing EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, or EMAILJS_PRIVATE_KEY');
        }

        console.log(`[EmailService] Sending customer email via EmailJS: ${customerEmail}`);
        const emailJsResponse = await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          emailjsTemplateParams,
          {
            publicKey: EMAILJS_PUBLIC_KEY,
            privateKey: EMAILJS_PRIVATE_KEY
          }
        );
        logger.info(`Order email sent to customer via EmailJS: ${customerEmail}`);
        logger.info(`EmailJS response: ${emailJsResponse?.status} ${emailJsResponse?.text || ''}`);
      } else {
        logger.warn(`Skipped sending order email to customer for ${orderId}: No valid email found or dummy email.`);
      }
    } catch (err) {
      console.error(`[EmailService] Error sending email to customer:`, err);
      logger.error(`Error sending customer email via EmailJS: ${err?.message || err}`);
      if (err?.stack) {
        logger.error(err.stack);
      }
    }

    // Try sending to Admin via Resend
    try {
      if (!resendApiKey) {
        throw new Error('RESEND_API_KEY is not configured');
      }

      console.log(`[EmailService] Sending email to admin: ${ADMIN_EMAIL}`);
      const adminRes = await sendResendWithFallback({
        to: ADMIN_EMAIL,
        subject: `New Order Received - #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #000;">New Order Received: #${orderId}</h2>
            <p>A new order has been placed on the store.</p>
            ${orderSummaryHtml}
            <p style="margin-top: 30px;">Please check the admin dashboard for more details and to fulfill this order.</p>
          </div>
        `
      });
      const adminMessageId = assertResendSuccess(adminRes, 'Admin email send failed', ADMIN_EMAIL);
      console.log(`[EmailService] Resend API Response (Admin):`, adminRes);
      logger.info(`Order email sent to admin: ${ADMIN_EMAIL}`);
      logger.info(`Admin email message id: ${adminMessageId}`);
    } catch (err) {
      console.error(`[EmailService] Error sending email to admin:`, err);
      logger.error(`Error sending admin email via Resend: ${err?.message || err}`);
      if (err?.stack) {
        logger.error(err.stack);
      }
    }

  } catch (error) {
    console.error(`[EmailService] CRITICAL ERROR sending confirmation email:`, error);
    logger.error('Error sending confirmation email via Resend:', error);
  }
};

module.exports = {
  sendOrderConfirmationEmails
};
