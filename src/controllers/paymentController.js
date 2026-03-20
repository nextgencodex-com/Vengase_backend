const crypto = require('crypto');
const logger = require('../utils/logger');
const Order = require('../models/Order');
const { sendOrderConfirmationEmails } = require('../utils/emailService');

const normalizePemKey = (rawKey) => {
    if (!rawKey) return null;

    const keyWithNewlines = String(rawKey)
        .replace(/\\n/g, '\n')
        .replace(/\r/g, '')
        .trim();

    // Preserve header/footer, trim only inner lines to avoid accidental whitespace corruption.
    return keyWithNewlines
        .split('\n')
        .map((line) => line.trim())
        .join('\n');
};

const getWebxpayPadding = () => {
    const mode = String(process.env.WEBXPAY_ENCRYPTION_PADDING || 'pkcs1').toLowerCase();
    if (mode === 'oaep') {
        return crypto.constants.RSA_PKCS1_OAEP_PADDING;
    }
    return crypto.constants.RSA_PKCS1_PADDING;
};

const normalizeOrderId = (value) => {
    if (value === undefined || value === null) return '';
    try {
        return decodeURIComponent(String(value)).replace(/\0/g, '').trim();
    } catch (_) {
        return String(value).replace(/\0/g, '').trim();
    }
};

// All secrets MUST be set in .env — no hardcoded fallbacks
const WEBXPAY_SECRET_KEY = process.env.WEBXPAY_SECRET_KEY;
const WEBXPAY_PUBLIC_KEY = normalizePemKey(process.env.WEBXPAY_PUBLIC_KEY);
const WEBXPAY_CHECKOUT_URL = process.env.WEBXPAY_CHECKOUT_URL || 'https://webxpay.com/index.php?route=checkout/billing';
const WEBXPAY_ENCRYPTION_PADDING = getWebxpayPadding();

const PAYZY_SECRET_KEY = process.env.PAYZY_SECRET_KEY || 'dummy_secret';
const PAYZY_SHOP_ID = process.env.PAYZY_SHOP_ID || 'dummy_shop_id';
const PAYZY_TEST_MODE = process.env.PAYZY_TEST_MODE || 'on';

if (!WEBXPAY_SECRET_KEY) {
  logger.error('WEBXPAY_SECRET_KEY is not set in environment variables!');
}
if (!WEBXPAY_PUBLIC_KEY) {
  logger.warn('WEBXPAY_PUBLIC_KEY is not set — callback RSA decryption will be skipped.');
}
if (WEBXPAY_PUBLIC_KEY) {
    try {
        const keyObj = crypto.createPublicKey(WEBXPAY_PUBLIC_KEY);
        const normalizedPem = keyObj.export({ type: 'spki', format: 'pem' }).toString();
        const fingerprint = crypto.createHash('sha256').update(normalizedPem).digest('hex').slice(0, 16);
        const paddingName = WEBXPAY_ENCRYPTION_PADDING === crypto.constants.RSA_PKCS1_OAEP_PADDING ? 'OAEP' : 'PKCS1';
        logger.info(`[WebXPay] Public key loaded (fingerprint: ${fingerprint}, padding: ${paddingName})`);
    } catch (e) {
        logger.error(`[WebXPay] Invalid public key format: ${e.message}`);
    }
}
if (!process.env.PAYZY_SECRET_KEY) {
  logger.warn('PAYZY_SECRET_KEY is not set in environment variables! Using dummy key.');
}

exports.generatePaymentPayload = async (req, res, next) => {
    try {
        const { orderId, amount, customerDetails } = req.body;

        const clean = (value, fallback = '') => String(value ?? fallback).trim();
        const cleanPhone = (value) => clean(value).replace(/[^0-9]/g, '');
        const cleanPostal = (value) => clean(value).replace(/[^0-9A-Za-z]/g, '');

        if (!WEBXPAY_SECRET_KEY || !WEBXPAY_PUBLIC_KEY) {
            logger.error('WebXPay config missing. secret/public key must be configured.');
            return res.status(500).json({
                success: false,
                error: 'WebXPay is not configured. Please contact support.'
            });
        }

        const normalizedOrderId = String(orderId || '').trim();
        const normalizedAmount = Number(amount);

        if (!normalizedOrderId) {
            return res.status(400).json({ success: false, error: 'Invalid orderId for payment.' });
        }
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount for payment.' });
        }

        const amountForGateway = normalizedAmount.toFixed(2);

        // The format should be: unique_order_id|total_amount (Eg : 12001|2567.50)
        const paymentString = `${normalizedOrderId}|${amountForGateway}`;

        // Encrypt using RSA public key and encode in Base64
        const buffer = Buffer.from(paymentString, 'utf8');
        const encrypted = crypto.publicEncrypt({
            key: WEBXPAY_PUBLIC_KEY,
            padding: WEBXPAY_ENCRYPTION_PADDING
        }, buffer);
        const paymentData = encrypted.toString('base64');

        // Optional custom fields
        const customFields = Buffer.from('').toString('base64'); 

        const payload = {
            first_name: clean(customerDetails?.firstName, 'Customer'),
            last_name: clean(customerDetails?.lastName, 'Name'),
            email: clean(customerDetails?.email, 'customer@example.com'),
            contact_number: cleanPhone(customerDetails?.contact) || '000000000',
            address_line_one: clean(customerDetails?.address, 'Address'),
            city: clean(customerDetails?.city, 'City'),
            state: clean(customerDetails?.state, 'State'),
            postal_code: cleanPostal(customerDetails?.postalCode) || '00000',
            country: clean(customerDetails?.country, 'Sri Lanka'),
            process_currency: 'LKR', // Or USD depending on your stores
            cms: 'PHP',
            payment: paymentData,
            secret_key: String(WEBXPAY_SECRET_KEY).trim(),
            custom_fields: customFields
        };

        logger.info(`[WebXPay] Payload generated for order ${normalizedOrderId}, amount ${amountForGateway}, url: ${WEBXPAY_CHECKOUT_URL}`);

        res.status(200).json({
            success: true,
            payload: payload,
            url: WEBXPAY_CHECKOUT_URL
        });
    } catch (error) {
        logger.error('Error generating payment payload:', error);
        res.status(500).json({ success: false, error: 'Payment setup failed' });
    }
};

exports.paymentCallback = async (req, res, next) => {
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
        const body = (req.body && Object.keys(req.body).length > 0) ? req.body : (req.query || {});
        logger.info('WebXPay Callback received:', body);

        // ----- Security guard: verify secret_key sent back matches ours -----
        const receivedSecretKey = String(
            body.secret_key || body.secretKey || body.x_secret_key || ''
        ).trim();
        const expectedSecretKey = String(WEBXPAY_SECRET_KEY || '').trim();

        if (expectedSecretKey && receivedSecretKey && receivedSecretKey !== expectedSecretKey) {
            logger.warn('WebXPay callback rejected: secret_key mismatch');
            return res.redirect(`${FRONTEND_URL}/?payment=failed`);
        }

        // ----- Parse payment data -----
        // WebXPay may send either an encrypted payment blob or direct fields in query/body.
        const paymentB64 = body.payment || body.payment_data || body.paymentData || body.x_payment;

        let orderId = body.order_id || body.x_order_id || body.orderId || null;
        let statusCode = body.status_code || body.response_code || body.x_status_code || null;
        let comment = body.comment || body.response_message || '';

        // Try RSA publicDecrypt (WebXPay encrypts callback with their private key → decrypt with their public key)
        if (paymentB64 && WEBXPAY_PUBLIC_KEY) {
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
        } else if (paymentB64) {
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
        } else {
            logger.info('WebXPay callback did not include encrypted payment blob, using direct fields only');
        }

        orderId = normalizeOrderId(orderId);
        logger.info(`WebXPay parsed: orderId=${orderId}, statusCode=${statusCode}, comment=${comment}`);

        let redirectResult = 'failed';
        if (orderId) {
            const normalizedStatus = String(statusCode || '').trim().toLowerCase();
            const normalizedComment = String(comment || '').trim().toLowerCase();
            const isSuccess = ['0', '00', '1', 'ok', 'success', 'approved', 'paid'].includes(normalizedStatus)
                || /success|approved|paid/.test(normalizedComment);

            if (isSuccess) {
                await Order.updatePaymentStatus(orderId, 'paid');
                await Order.updateOrderStatus(orderId, 'confirmed');
                logger.info(`Order ${orderId} payment marked as PAID and CONFIRMED`);
                redirectResult = 'success';
                
                // Send confirmation email asynchronously
                sendOrderConfirmationEmails(orderId).catch(err => logger.error(err));
            } else {
                await Order.updatePaymentStatus(orderId, 'failed');
                logger.info(`Order ${orderId} payment marked as FAILED (statusCode=${statusCode})`);
                redirectResult = 'failed';
            }
        } else {
            logger.warn('WebXPay callback: could not determine orderId — order status not updated');
        }

        res.redirect(`${FRONTEND_URL}/?payment=${redirectResult}`);
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

        if (!orderId) {
            return res.status(400).json({ success: false, error: 'Missing orderId' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
        
        const x_test_mode = PAYZY_TEST_MODE;
        const x_shopid = PAYZY_SHOP_ID;
        const orderTotal = Number(order.totalAmount);
        const requestedAmount = Number(amount);
        const effectiveAmount = Number.isFinite(orderTotal) && orderTotal > 0
            ? orderTotal
            : requestedAmount;

        if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
            logger.warn(`Payzy payload rejected for order ${orderId}: invalid amount (orderTotal=${order.totalAmount}, requestedAmount=${amount})`);
            return res.status(400).json({ success: false, error: 'Invalid order amount for Payzy' });
        }

        const x_amount = effectiveAmount.toFixed(2);
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

        logger.info(`Payzy payload amount resolved for order ${orderId}: ${x_amount}`);
        
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

        // Save payment metadata for later verification; if this fails, continue checkout generation.
        try {
            const { getFirestore } = require('../../config/firebase');
            const db = getFirestore();
            await db.collection('orders').doc(orderId).update({ paymentMeta });
        } catch (metaErr) {
            logger.warn(`Could not persist Payzy paymentMeta for order ${orderId}: ${metaErr.message}`);
        }

        // Build Payload
        const payload = {
            ...paymentMeta,
            signed_field_names: "x_test_mode,x_shopid,x_amount,x_order_id,x_response_url,x_first_name,x_last_name,x_company,x_address,x_country,x_state,x_city,x_zip,x_phone,x_email,x_ship_to_first_name,x_ship_to_last_name,x_ship_to_company,x_ship_to_address,x_ship_to_country,x_ship_to_state,x_ship_to_city,x_ship_to_zip,x_freight,x_platform,x_version,signed_field_names",
            signature: hash
        };

        const axios = require('axios');
        const response = await axios.post("https://api.payzy.lk/checkout/custom-checkout", payload, {
            timeout: 20000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const payzyUrl =
            response?.data?.url ||
            response?.data?.data?.url ||
            response?.data?.checkout_url ||
            response?.data?.redirect_url;

        if (payzyUrl) {
            res.status(200).json({
                success: true,
                url: payzyUrl
            });
        } else {
            logger.error('Unexpected Payzy response shape:', response.data);
            throw new Error('Invalid response from Payzy API');
        }
    } catch (error) {
        const upstreamMessage =
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.response?.data?.detail ||
            error?.message ||
            'Payzy payment setup failed';

        logger.error('Error in generatePayzyPayload:', {
            message: error?.message,
            code: error?.code,
            status: error?.response?.status,
            data: error?.response?.data
        });

        res.status(500).json({ success: false, error: upstreamMessage });
    }
};

exports.verifyPayzyPayment = async (req, res, next) => {
    try {
        const { x_order_id, response_code, signature } = req.body;
        const normalizedOrderId = normalizeOrderId(x_order_id);

        if (!normalizedOrderId || !signature) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }

        const { getFirestore } = require('../../config/firebase');
        const db = getFirestore();
        const orderDoc = await db.collection('orders').doc(normalizedOrderId).get();

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
                await Order.updatePaymentStatus(normalizedOrderId, 'paid');
                await Order.updateOrderStatus(normalizedOrderId, 'confirmed');
                logger.info(`Payzy Order ${normalizedOrderId} payment marked as PAID and CONFIRMED`);
                
                // Send confirmation email asynchronously
                sendOrderConfirmationEmails(normalizedOrderId).catch(err => logger.error(err));
                
                return res.status(200).json({ success: true, payment_status: 'paid' });
            } else {
                await Order.updatePaymentStatus(normalizedOrderId, 'failed');
                logger.info(`Payzy Order ${normalizedOrderId} payment failed with code ${response_code}`);
                return res.status(200).json({ success: true, payment_status: 'failed' });
            }
        } else {
            logger.warn(`Payzy signature mismatch for order ${normalizedOrderId}`);
            return res.status(400).json({ success: false, error: 'Signature mismatch' });
        }
    } catch (error) {
        logger.error('Error in verifyPayzyPayment:', error);
        res.status(500).json({ success: false, error: 'Payment verification failed' });
    }
};