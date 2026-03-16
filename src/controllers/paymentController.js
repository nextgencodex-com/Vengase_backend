const crypto = require('crypto');
const logger = require('../utils/logger');
const Order = require('../models/Order');

// All secrets MUST be set in .env — no hardcoded fallbacks
const WEBXPAY_SECRET_KEY = process.env.WEBXPAY_SECRET_KEY;
const WEBXPAY_PUBLIC_KEY = process.env.WEBXPAY_PUBLIC_KEY
  ? process.env.WEBXPAY_PUBLIC_KEY.replace(/\\n/g, '\n')
  : null;

if (!WEBXPAY_SECRET_KEY) {
  logger.error('WEBXPAY_SECRET_KEY is not set in environment variables!');
}
if (!WEBXPAY_PUBLIC_KEY) {
  logger.warn('WEBXPAY_PUBLIC_KEY is not set — callback RSA decryption will be skipped.');
}

exports.generatePaymentPayload = async (req, res, next) => {
    try {
        const { orderId, amount, customerDetails } = req.body;

        // The format should be: unique_order_id|total_amount (Eg : 12001|2567.50)
        const paymentString = `${orderId}|${amount}`;

        // Encrypt using RSA public key and encode in Base64
        const buffer = Buffer.from(paymentString, 'utf8');
        const encrypted = crypto.publicEncrypt({
            key: WEBXPAY_PUBLIC_KEY,
            padding: crypto.constants.RSA_PKCS1_PADDING
        }, buffer);
        const paymentData = encrypted.toString('base64');

        // Optional custom fields
        const customFields = Buffer.from('').toString('base64'); 

        const payload = {
            first_name: customerDetails.firstName || 'Customer',
            last_name: customerDetails.lastName || 'Name',
            email: customerDetails.email || 'customer@example.com',
            contact_number: customerDetails.contact || '000000000',
            address_line_one: customerDetails.address || 'Address',
            city: customerDetails.city || 'City',
            state: customerDetails.state || 'State',
            postal_code: customerDetails.postalCode || '00000',
            country: customerDetails.country || 'Sri Lanka',
            process_currency: 'LKR', // Or USD depending on your stores
            cms: 'React',
            payment: paymentData,
            secret_key: WEBXPAY_SECRET_KEY,
            custom_fields: customFields
        };

        res.status(200).json({
            success: true,
            payload: payload,
            url: 'https://webxpay.com/index.php?route=checkout/billing' // LIVE URL
        });
    } catch (error) {
        logger.error('Error generating payment payload:', error);
        res.status(500).json({ success: false, error: 'Payment setup failed' });
    }
};

exports.paymentCallback = async (req, res, next) => {
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
        const body = req.body;
        logger.info('WebXPay Callback received:', body);

        // ----- Security guard: verify secret_key sent back matches ours -----
        const receivedSecretKey = body.secret_key;
        if (!receivedSecretKey || receivedSecretKey !== WEBXPAY_SECRET_KEY) {
            logger.warn('WebXPay callback rejected: secret_key mismatch');
            return res.redirect(`${FRONTEND_URL}/?payment=failed`);
        }

        // ----- Parse payment data -----
        // WebXPay sends base64-encoded, RSA-encrypted string: orderId|refNo|datetime|statusCode|comment|gateway
        const paymentB64 = body.payment;

        if (!paymentB64) {
            logger.warn('WebXPay callback missing payment field');
            return res.redirect(`${FRONTEND_URL}/?payment=failed`);
        }

        let orderId = null;
        let statusCode = null;
        let comment = '';

        // Try RSA publicDecrypt (WebXPay encrypts callback with their private key → decrypt with their public key)
        if (WEBXPAY_PUBLIC_KEY) {
            try {
                const buffer = Buffer.from(paymentB64, 'base64');
                const decryptedData = crypto.publicDecrypt(
                    { key: WEBXPAY_PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING },
                    buffer
                ).toString('utf8');

                logger.info('WebXPay decrypted payment data:', decryptedData);
                // Format: order_id|order_reference_number|date_time|status_code|comment|payment_gateway
                const parts = decryptedData.split('|');
                orderId    = parts[0] || null;
                statusCode = parts[3] || null;
                comment    = parts[4] || '';
            } catch (decryptErr) {
                logger.warn('RSA publicDecrypt failed, trying plain base64 parse:', decryptErr.message);
                // Fallback: try plain base64 decode (some WebXPay versions send plain text in base64)
                try {
                    const plainData = Buffer.from(paymentB64, 'base64').toString('utf8');
                    if (plainData.includes('|')) {
                        const parts = plainData.split('|');
                        orderId    = parts[0] || null;
                        statusCode = parts[3] || null;
                        comment    = parts[4] || '';
                        logger.info('WebXPay plain base64 parse succeeded:', { orderId, statusCode });
                    }
                } catch (parseErr) {
                    logger.error('All payment data parsing attempts failed:', parseErr.message);
                }
            }
        } else {
            // No public key configured: try plain base64 decode as last resort
            try {
                const plainData = Buffer.from(paymentB64, 'base64').toString('utf8');
                if (plainData.includes('|')) {
                    const parts = plainData.split('|');
                    orderId    = parts[0] || null;
                    statusCode = parts[3] || null;
                    comment    = parts[4] || '';
                }
            } catch (e) {
                logger.error('Plain base64 parse failed:', e.message);
            }
        }

        logger.info(`WebXPay parsed: orderId=${orderId}, statusCode=${statusCode}, comment=${comment}`);

        if (orderId) {
            // status_code '0' or '00' means success in WebXPay
            if (statusCode === '0' || statusCode === '00') {
                await Order.updatePaymentStatus(orderId, 'paid');
                await Order.updateOrderStatus(orderId, 'confirmed');
                logger.info(`Order ${orderId} payment marked as PAID and CONFIRMED`);
            } else {
                await Order.updatePaymentStatus(orderId, 'failed');
                logger.info(`Order ${orderId} payment marked as FAILED (statusCode=${statusCode})`);
            }
        } else {
            logger.warn('WebXPay callback: could not determine orderId — order status not updated');
        }

        // Always redirect to success page (payment was processed, user can check order)
        res.redirect(`${FRONTEND_URL}/?payment=success`);
    } catch (error) {
        logger.error('Error in payment callback:', error);
        const FRONTEND_URL_SAFE = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${FRONTEND_URL_SAFE}/?payment=failed`);
    }
};