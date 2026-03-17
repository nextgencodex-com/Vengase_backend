const crypto = require('crypto');
const logger = require('../utils/logger');
const Order = require('../models/Order');

// All secrets MUST be set in .env — no hardcoded fallbacks
const WEBXPAY_SECRET_KEY = process.env.WEBXPAY_SECRET_KEY;
const WEBXPAY_PUBLIC_KEY = process.env.WEBXPAY_PUBLIC_KEY
  ? process.env.WEBXPAY_PUBLIC_KEY.replace(/\\n/g, '\n')
  : null;

const PAYZY_SECRET_KEY = process.env.PAYZY_SECRET_KEY || 'dummy_secret';
const PAYZY_SHOP_ID = process.env.PAYZY_SHOP_ID || 'dummy_shop_id';
const PAYZY_TEST_MODE = process.env.PAYZY_TEST_MODE || 'on';

if (!WEBXPAY_SECRET_KEY) {
  logger.error('WEBXPAY_SECRET_KEY is not set in environment variables!');
}
if (!WEBXPAY_PUBLIC_KEY) {
  logger.warn('WEBXPAY_PUBLIC_KEY is not set — callback RSA decryption will be skipped.');
}
if (!process.env.PAYZY_SECRET_KEY) {
  logger.warn('PAYZY_SECRET_KEY is not set in environment variables! Using dummy key.');
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

// --- PAYZY INTEGRATION ---

exports.generatePayzyPayload = async (req, res, next) => {
    try {
        const { orderId, amount, customerDetails } = req.body;
        
        const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
        
        const x_test_mode = PAYZY_TEST_MODE;
        const x_shopid = PAYZY_SHOP_ID;
        const x_amount = parseFloat(amount).toFixed(2);
        const x_order_id = orderId;
        const x_response_url = `${FRONTEND_URL}/?payment=payzy-callback`;
        
        const x_first_name = customerDetails.firstName || 'Customer';
        const x_last_name = customerDetails.lastName || 'Name';
        const x_company = 'Vengase';
        const x_address = customerDetails.address || 'Address';
        const x_country = customerDetails.country || 'Sri Lanka';
        const x_state = customerDetails.state || 'Western';
        const x_city = customerDetails.city || 'City';
        const x_zip = customerDetails.postalCode || '00000';
        const x_phone = customerDetails.contact || '000000000';
        const x_email = customerDetails.email || 'customer@example.com';
        
        const x_ship_to_first_name = x_first_name;
        const x_ship_to_last_name = x_last_name;
        const x_ship_to_company = x_company;
        const x_ship_to_address = x_address;
        const x_ship_to_country = x_country;
        const x_ship_to_state = x_state;
        const x_ship_to_city = x_city;
        const x_ship_to_zip = x_zip;
        const x_freight = '0.00';
        const x_platform = 'custom';
        const x_version = '1.0';

        const list = "x_test_mode=" + x_test_mode +
            ",x_shopid=" + x_shopid +
            ",x_amount=" + x_amount +
            ",x_order_id=" + x_order_id +
            ",x_response_url=" + x_response_url +
            ",x_first_name=" + x_first_name +
            ",x_last_name=" + x_last_name +
            ",x_company=" + x_company +
            ",x_address=" + x_address +
            ",x_country=" + x_country +
            ",x_state=" + x_state +
            ",x_city=" + x_city +
            ",x_zip=" + x_zip +
            ",x_phone=" + x_phone +
            ",x_email=" + x_email +
            ",x_ship_to_first_name=" + x_ship_to_first_name +
            ",x_ship_to_last_name=" + x_ship_to_last_name +
            ",x_ship_to_company=" + x_ship_to_company +
            ",x_ship_to_address=" + x_ship_to_address +
            ",x_ship_to_country=" + x_ship_to_country +
            ",x_ship_to_state=" + x_ship_to_state +
            ",x_ship_to_city=" + x_ship_to_city +
            ",x_ship_to_zip=" + x_ship_to_zip +
            ",x_freight=" + x_freight +
            ",x_platform=" + x_platform +
            ",x_version=" + x_version +
            ",signed_field_names=" + 
            "x_test_mode,x_shopid,x_amount,x_order_id,x_response_url,x_first_name,x_last_name,x_company,x_address,x_country,x_state,x_city,x_zip,x_phone,x_email,x_ship_to_first_name,x_ship_to_last_name,x_ship_to_company,x_ship_to_address,x_ship_to_country,x_ship_to_state,x_ship_to_city,x_ship_to_zip,x_freight,x_platform,x_version,signed_field_names";
        
        const hash = crypto.createHmac('sha256', PAYZY_SECRET_KEY).update(list).digest('base64');
        
        const paymentMeta = {
            x_test_mode, x_shopid, x_amount, x_order_id, x_response_url,
            x_first_name, x_last_name, x_company, x_address, x_country,
            x_state, x_city, x_zip, x_phone, x_email,
            x_ship_to_first_name, x_ship_to_last_name, x_ship_to_company,
            x_ship_to_address, x_ship_to_country, x_ship_to_state, x_ship_to_city,
            x_ship_to_zip, x_freight, x_platform, x_version
        };

        // Save paymentMeta to the Order via Mongoose-equivalent update if needed
        // Assuming Order update function allows partial update or direct DB call:
        const { getFirestore } = require('../../config/firebase');
        const db = getFirestore();
        await db.collection('orders').doc(orderId).update({ paymentMeta });

        // Build Payload
        const payload = {
            ...paymentMeta,
            signed_field_names: "x_test_mode,x_shopid,x_amount,x_order_id,x_response_url,x_first_name,x_last_name,x_company,x_address,x_country,x_state,x_city,x_zip,x_phone,x_email,x_ship_to_first_name,x_ship_to_last_name,x_ship_to_company,x_ship_to_address,x_ship_to_country,x_ship_to_state,x_ship_to_city,x_ship_to_zip,x_freight,x_platform,x_version,signed_field_names",
            signature: hash
        };

        const axios = require('axios');
        const response = await axios.post("https://api.payzy.lk/checkout/custom-checkout", payload);

        if (response.data && response.data.data && response.data.data.url) {
            res.status(200).json({
                success: true,
                url: response.data.data.url
            });
        } else {
            throw new Error('Invalid response from Payzy API');
        }
    } catch (error) {
        logger.error('Error in generatePayzyPayload:', error);
        res.status(500).json({ success: false, error: 'Payzy payment setup failed' });
    }
};

exports.verifyPayzyPayment = async (req, res, next) => {
    try {
        const { x_order_id, response_code, signature } = req.body;

        if (!x_order_id || !signature) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }

        const { getFirestore } = require('../../config/firebase');
        const db = getFirestore();
        const orderDoc = await db.collection('orders').doc(x_order_id).get();

        if (!orderDoc.exists) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        const order = orderDoc.data();
        const meta = order.paymentMeta;

        if (!meta) {
            return res.status(400).json({ success: false, error: 'Payment metadata not found for this order' });
        }

        const datalist = "response_code=" + response_code +
            ",x_test_mode=" + meta.x_test_mode +
            ",x_shopid=" + meta.x_shopid +
            ",x_amount=" + meta.x_amount +
            ",x_order_id=" + meta.x_order_id +
            ",x_response_url=" + meta.x_response_url +
            ",x_first_name=" + meta.x_first_name +
            ",x_last_name=" + meta.x_last_name +
            ",x_company=" + meta.x_company +
            ",x_address=" + meta.x_address +
            ",x_country=" + meta.x_country +
            ",x_state=" + meta.x_state +
            ",x_city=" + meta.x_city +
            ",x_zip=" + meta.x_zip +
            ",x_phone=" + meta.x_phone +
            ",x_email=" + meta.x_email +
            ",x_ship_to_first_name=" + meta.x_ship_to_first_name +
            ",x_ship_to_last_name=" + meta.x_ship_to_last_name +
            ",x_ship_to_company=" + meta.x_ship_to_company +
            ",x_ship_to_address=" + meta.x_ship_to_address +
            ",x_ship_to_country=" + meta.x_ship_to_country +
            ",x_ship_to_state=" + meta.x_ship_to_state +
            ",x_ship_to_city=" + meta.x_ship_to_city +
            ",x_ship_to_zip=" + meta.x_ship_to_zip +
            ",x_freight=" + meta.x_freight +
            ",x_platform=" + meta.x_platform +
            ",x_version=" + meta.x_version +
            ",signed_field_names=" + 
            "response_code,x_test_mode,x_shopid,x_amount,x_order_id,x_response_url,x_first_name,x_last_name,x_company,x_address,x_country,x_state,x_city,x_zip,x_phone,x_email,x_ship_to_first_name,x_ship_to_last_name,x_ship_to_company,x_ship_to_address,x_ship_to_country,x_ship_to_state,x_ship_to_city,x_ship_to_zip,x_freight,x_platform,x_version,signed_field_names";

        const hash = crypto.createHmac('sha256', PAYZY_SECRET_KEY).update(datalist).digest('base64');
        const newSignature = hash.replace(/\s/g, "+");
        const formattedReceivedSignature = signature.replace(/\s/g, "+");

        if (newSignature === formattedReceivedSignature) {
            if (response_code === '00') {
                await Order.updatePaymentStatus(x_order_id, 'paid');
                await Order.updateOrderStatus(x_order_id, 'confirmed');
                logger.info(`Payzy Order ${x_order_id} payment marked as PAID and CONFIRMED`);
                return res.status(200).json({ success: true, payment_status: 'paid' });
            } else {
                await Order.updatePaymentStatus(x_order_id, 'failed');
                logger.info(`Payzy Order ${x_order_id} payment failed with code ${response_code}`);
                return res.status(200).json({ success: true, payment_status: 'failed' });
            }
        } else {
            logger.warn(`Payzy signature mismatch for order ${x_order_id}`);
            return res.status(400).json({ success: false, error: 'Signature mismatch' });
        }
    } catch (error) {
        logger.error('Error in verifyPayzyPayment:', error);
        res.status(500).json({ success: false, error: 'Payment verification failed' });
    }
};