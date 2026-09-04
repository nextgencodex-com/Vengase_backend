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

const PAYZY_SECRET_KEY = process.env.PAYZY_SECRET_KEY || '';
const PAYZY_SHOP_ID = process.env.PAYZY_SHOP_ID || '';
const PAYZY_TEST_MODE = process.env.PAYZY_TEST_MODE || 'off';
const PAYZY_API_BASE_URL = String(process.env.PAYZY_API_BASE_URL || 'https://api.payzy.lk').replace(/\/+$/, '');

const getByPath = (obj, path) => path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

const resolvePayzyCheckoutUrl = (responseData) => {
    const knownPaths = [
        ['url'],
        ['checkout_url'],
        ['redirect_url'],
        ['payment_url'],
        ['data', 'url'],
        ['data', 'checkout_url'],
        ['data', 'redirect_url'],
        ['data', 'payment_url'],
        ['data', 'payment', 'url'],
        ['result', 'url'],
        ['result', 'checkout_url'],
        ['result', 'redirect_url'],
        ['result', 'payment_url']
    ];

    for (const path of knownPaths) {
        const value = getByPath(responseData, path);
        if (typeof value === 'string' && value.startsWith('http')) {
            return value;
        }
    }

    return '';
};

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
  logger.warn('PAYZY_SECRET_KEY is not set in environment variables!');
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
                
                // Send confirmation email
                try {
                    await sendOrderConfirmationEmails(orderId);
                } catch (err) {
                    logger.error(err);
                }
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
        const customer = customerDetails || {};
        const asString = (value, fallback = '') => String(value ?? fallback).trim();

        if (!PAYZY_SECRET_KEY || !PAYZY_SHOP_ID) {
            logger.error('Payzy configuration missing in environment variables!');
            return res.status(500).json({ success: false, error: 'Payzy payment gateway is not properly configured.' });
        }

        if (!orderId) {
            return res.status(400).json({ success: false, error: 'Missing orderId' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
        
        const x_test_mode = asString(PAYZY_TEST_MODE, 'on');
        const x_shopid = asString(PAYZY_SHOP_ID, '');
        const orderTotal = Number(order.totalAmount);
        const requestedAmount = Number(amount);
        const effectiveAmount = Number.isFinite(orderTotal) && orderTotal > 0
            ? orderTotal
            : requestedAmount;

        if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
            logger.warn(`Payzy payload rejected for order ${orderId}: invalid amount (orderTotal=${order.totalAmount}, requestedAmount=${amount})`);
            return res.status(400).json({ success: false, error: 'Invalid order amount for Payzy' });
        }

        const x_amount = asString(effectiveAmount.toFixed(2), '0.00');
        const x_order_id = asString(orderId, '');
        const x_response_url = asString(`${FRONTEND_URL}/?payment=payzy-callback`, '');
        
        const x_first_name = asString(customer.firstName, 'Customer');
        const x_last_name = asString(customer.lastName, 'Name');
        const x_company = asString('Vengase', 'Vengase');
        const x_address = asString(customer.address, 'Address');
        const x_country = asString(customer.country, 'Sri Lanka');
        const x_state = asString(customer.state, 'Western');
        const x_city = asString(customer.city, 'City');
        const x_zip = asString(customer.postalCode, '00000');
        const x_phone = asString(customer.contact, '000000000');
        const x_email = asString(customer.email, 'customer@example.com');

        logger.info(`Payzy payload amount resolved for order ${orderId}: ${x_amount}`);
        
        const x_ship_to_first_name = asString(x_first_name, 'Customer');
        const x_ship_to_last_name = asString(x_last_name, 'Name');
        const x_ship_to_company = asString(x_company, 'Vengase');
        const x_ship_to_address = asString(x_address, 'Address');
        const x_ship_to_country = asString(x_country, 'Sri Lanka');
        const x_ship_to_state = asString(x_state, 'Western');
        const x_ship_to_city = asString(x_city, 'City');
        const x_ship_to_zip = asString(x_zip, '00000');
        const x_freight = asString('0.00', '0.00');
        const x_platform = asString('custom', 'custom');
        const x_version = asString('1.0', '1.0');

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
            ",x_version" + x_version +
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
        const response = await axios.post(`${PAYZY_API_BASE_URL}/checkout/custom-checkout`, payload, {
            timeout: 20000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const payzyUrl = resolvePayzyCheckoutUrl(response?.data || {});

        if (payzyUrl) {
            logger.info(`Payzy checkout URL resolved for order ${orderId}: ${payzyUrl}`);
            res.status(200).json({
                success: true,
                url: payzyUrl,
                data: {
                    x_order_id,
                    x_amount,
                    x_test_mode,
                    responseShape: Object.keys(response?.data || {})
                }
            });
        } else {
            logger.error('Unexpected Payzy response shape (could not resolve checkout URL):', response.data);
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
        const asString = (value, fallback = '') => String(value ?? fallback).trim();
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

        const datalist = "response_code=" + asString(response_code, '') +
            ",x_test_mode=" + asString(meta.x_test_mode, '') +
            ",x_shopid=" + asString(meta.x_shopid, '') +
            ",x_amount=" + asString(meta.x_amount, '') +
            ",x_order_id=" + asString(meta.x_order_id, '') +
            ",x_response_url=" + asString(meta.x_response_url, '') +
            ",x_first_name=" + asString(meta.x_first_name, '') +
            ",x_last_name=" + asString(meta.x_last_name, '') +
            ",x_company=" + asString(meta.x_company, '') +
            ",x_address=" + asString(meta.x_address, '') +
            ",x_country=" + asString(meta.x_country, '') +
            ",x_state=" + asString(meta.x_state, '') +
            ",x_city=" + asString(meta.x_city, '') +
            ",x_zip=" + asString(meta.x_zip, '') +
            ",x_phone=" + asString(meta.x_phone, '') +
            ",x_email=" + asString(meta.x_email, '') +
            ",x_ship_to_first_name=" + asString(meta.x_ship_to_first_name, '') +
            ",x_ship_to_last_name=" + asString(meta.x_ship_to_last_name, '') +
            ",x_ship_to_company=" + asString(meta.x_ship_to_company, '') +
            ",x_ship_to_address=" + asString(meta.x_ship_to_address, '') +
            ",x_ship_to_country=" + asString(meta.x_ship_to_country, '') +
            ",x_ship_to_state=" + asString(meta.x_ship_to_state, '') +
            ",x_ship_to_city=" + asString(meta.x_ship_to_city, '') +
            ",x_ship_to_zip=" + asString(meta.x_ship_to_zip, '') +
            ",x_freight=" + asString(meta.x_freight, '') +
            ",x_platform=" + asString(meta.x_platform, '') +
            ",x_version" + asString(meta.x_version, '') +
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
                
                // Send confirmation email
                try {
                    await sendOrderConfirmationEmails(normalizedOrderId);
                } catch (err) {
                    logger.error(err);
                }
                
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

const getMintpayConfig = () => {
    return {
        merchantId: String(process.env.MINTPAY_MERCHANT_ID || '').trim(),
        apiToken: String(process.env.MINTPAY_API_TOKEN || '').trim(),
        baseUrl: String(process.env.MINTPAY_API_BASE_URL || 'https://app.mintpay.lk').trim().replace(/\/+$/, '')
    };
};

const formatMintpayDate = (d = new Date()) => {
    const date = d instanceof Date ? d : new Date(d);
    const validDate = isNaN(date.getTime()) ? new Date() : date;
    const pad = (n) => String(n).padStart(2, '0');
    const YYYY = validDate.getFullYear();
    const MM = pad(validDate.getMonth() + 1);
    const DD = pad(validDate.getDate());
    const HH = pad(validDate.getHours());
    const mm = pad(validDate.getMinutes());
    const ss = pad(validDate.getSeconds());
    return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
};

const extractMintpayErrorMessage = (data) => {
    if (!data) return null;
    if (data.errors && typeof data.errors === 'object') {
        const errParts = [];
        for (const [field, val] of Object.entries(data.errors)) {
            if (Array.isArray(val)) {
                errParts.push(`${field}: ${val.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(', ')}`);
            } else if (typeof val === 'object') {
                errParts.push(`${field}: ${JSON.stringify(val)}`);
            } else {
                errParts.push(`${field}: ${val}`);
            }
        }
        if (errParts.length > 0) {
            return errParts.join('; ');
        }
    }
    if (data.message && data.message !== 'client side error') {
        return data.message;
    }
    if (data.data && typeof data.data === 'string') {
        return data.data;
    }
    return data.error || data.message || null;
};

// --- MINTPAY INTEGRATION ---

exports.generateMintpayPayload = async (req, res, next) => {
    try {
        const { orderId, amount, customerDetails, items } = req.body;
        const customer = customerDetails || {};
        const asCleanString = (value, fallback = '') => {
            const s = String(value ?? '').trim();
            return s.length > 0 ? s : fallback;
        };
        const config = getMintpayConfig();

        if (!config.merchantId || !config.apiToken) {
            logger.error('Mintpay config missing: MINTPAY_MERCHANT_ID and MINTPAY_API_TOKEN must be configured in .env');
            return res.status(500).json({
                success: false,
                error: 'Mintpay payment gateway is not properly configured on server.'
            });
        }

        if (!orderId) {
            return res.status(400).json({ success: false, error: 'Missing orderId' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
        const orderTotal = Number(order.totalAmount);
        const requestedAmount = Number(amount);
        const effectiveAmount = Number.isFinite(orderTotal) && orderTotal > 0
            ? orderTotal
            : requestedAmount;

        if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
            logger.warn(`Mintpay payload rejected for order ${orderId}: invalid amount`);
            return res.status(400).json({ success: false, error: 'Invalid order amount for Mintpay' });
        }

        // Get customer IP address
        const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
        const clientIp = rawIp.replace(/^.*:/, '') || '127.0.0.1';

        // Clean customer telephone
        const rawPhone = customer.contact || order.phone || '0770000000';
        let cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('94') && cleanPhone.length > 9) {
            cleanPhone = '0' + cleanPhone.slice(2);
        } else if (!cleanPhone.startsWith('0') && cleanPhone.length === 9) {
            cleanPhone = '0' + cleanPhone;
        }
        if (!cleanPhone || cleanPhone.length < 9) {
            cleanPhone = '0770000000';
        }

        // Validate and clean email
        const rawEmail = asCleanString(customer.email || order.userEmail, 'customer@vengase.com');
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
        const customerEmail = isValidEmail ? rawEmail : 'customer@vengase.com';

        const nowFormatted = formatMintpayDate(new Date());
        const orderCreatedDate = order.createdAt?._seconds || order.createdAt?.seconds
            ? formatMintpayDate(new Date((order.createdAt._seconds || order.createdAt.seconds) * 1000))
            : (order.createdAt ? formatMintpayDate(new Date(order.createdAt)) : nowFormatted);

        // Format order products
        const orderItems = (Array.isArray(items) && items.length > 0) ? items : (order.items || []);
        const formattedProducts = orderItems.map((item, idx) => {
            const rawPrice = Number(item.price);
            const itemPrice = (Number.isFinite(rawPrice) && rawPrice > 0) ? rawPrice : 1;
            const itemQuantity = Math.max(1, parseInt(item.quantity, 10) || 1);
            return {
                name: asCleanString(item.name, `Product ${idx + 1}`),
                product_id: asCleanString(item.productId || item.id || item._id, `PROD-${idx + 1}`),
                sku: asCleanString(item.size || item.sku, 'standard'),
                quantity: itemQuantity,
                unit_price: itemPrice.toFixed(4),
                created_date: nowFormatted,
                updated_date: nowFormatted
            };
        });

        // If no products found, create a fallback product
        if (formattedProducts.length === 0) {
            formattedProducts.push({
                name: `Order #${orderId}`,
                product_id: String(orderId),
                sku: 'standard',
                quantity: 1,
                unit_price: effectiveAmount.toFixed(4),
                created_date: nowFormatted,
                updated_date: nowFormatted
            });
        }

        const mintpayPayload = {
            merchant_id: config.merchantId,
            order_id: String(orderId),
            total_price: effectiveAmount.toFixed(4),
            channel: 'ONL',
            checkout_option: 'WEB',
            customer_email: customerEmail,
            customer_telephone: cleanPhone,
            ip: clientIp,
            x_forwarded_for: clientIp,
            delivery_street: asCleanString(customer.address || order.shippingAddress?.address, 'Street Address'),
            delivery_region: asCleanString(customer.city || order.shippingAddress?.city, 'Colombo'),
            delivery_postcode: asCleanString(customer.postalCode || order.shippingAddress?.postalCode, '00000'),
            cart_created_date: orderCreatedDate,
            cart_updated_date: nowFormatted,
            success_url: `${FRONTEND_URL}/?payment=mintpay-callback&status=success&order_id=${encodeURIComponent(orderId)}`,
            fail_url: `${FRONTEND_URL}/?payment=mintpay-callback&status=failed&order_id=${encodeURIComponent(orderId)}`,
            products: formattedProducts
        };

        logger.info(`[Mintpay] Sending order submission for order ${orderId}, total: ${mintpayPayload.total_price}, target: ${config.baseUrl}`);

        const axios = require('axios');
        const response = await axios.post(`${config.baseUrl}/api/v2/purchase/merchant-gateway/`, mintpayPayload, {
            timeout: 20000,
            headers: {
                'Authorization': `Token ${config.apiToken}`,
                'Content-Type': 'application/json'
            }
        });

        const responseData = response?.data;
        const purchaseId = responseData?.data?.id || responseData?.data?.uid;
        const checkoutLink = responseData?.data?.checkout_link;

        if (checkoutLink) {
            logger.info(`[Mintpay] Order submission success for ${orderId}, purchaseId: ${purchaseId}, checkout: ${checkoutLink}`);

            // Persist paymentMeta in Firestore order
            try {
                const { getFirestore } = require('../../config/firebase');
                const db = getFirestore();
                await db.collection('orders').doc(orderId).update({
                    paymentMeta: {
                        mintpay_purchase_id: purchaseId,
                        merchant_id: config.merchantId,
                        submitted_at: new Date()
                    }
                });
            } catch (metaErr) {
                logger.warn(`Could not persist Mintpay paymentMeta for order ${orderId}: ${metaErr.message}`);
            }

            return res.status(200).json({
                success: true,
                url: checkoutLink,
                purchase_id: purchaseId,
                order_id: orderId
            });
        } else {
            logger.error('[Mintpay] Order Submission response missing checkout_link:', responseData);
            throw new Error(responseData?.message || 'Invalid response from Mintpay API');
        }
    } catch (error) {
        const upstreamError = extractMintpayErrorMessage(error?.response?.data);
        const upstreamMessage = upstreamError || error?.message || 'Mintpay payment setup failed';

        logger.error('[Mintpay] Error in generateMintpayPayload:', {
            message: error?.message,
            code: error?.code,
            status: error?.response?.status,
            data: error?.response?.data,
            parsedError: upstreamMessage
        });

        res.status(500).json({ success: false, error: upstreamMessage });
    }
};

exports.verifyMintpayPayment = async (req, res, next) => {
    try {
        const { order_id, purchase_id } = req.body;
        const normalizedOrderId = normalizeOrderId(order_id);
        const config = getMintpayConfig();

        if (!config.merchantId || !config.apiToken) {
            logger.error('Mintpay config missing for verification: MINTPAY_MERCHANT_ID and MINTPAY_API_TOKEN must be configured in .env');
            return res.status(500).json({ success: false, error: 'Mintpay payment gateway is not properly configured on server.' });
        }

        let resolvedPurchaseId = purchase_id;

        // If purchase_id not provided in body, check Firestore order document
        if (!resolvedPurchaseId && normalizedOrderId) {
            const { getFirestore } = require('../../config/firebase');
            const db = getFirestore();
            const orderDoc = await db.collection('orders').doc(normalizedOrderId).get();
            if (orderDoc.exists) {
                const orderData = orderDoc.data();
                resolvedPurchaseId = orderData.paymentMeta?.mintpay_purchase_id;
            }
        }

        if (!resolvedPurchaseId) {
            return res.status(400).json({ success: false, error: 'Missing purchase_id for Mintpay verification' });
        }

        logger.info(`[Mintpay] Verifying payment for order ${normalizedOrderId}, purchaseId: ${resolvedPurchaseId}`);

        const axios = require('axios');
        const statusResponse = await axios.get(`${config.baseUrl}/api/v2/purchase/merchant-gateway/status-purchase`, {
            params: {
                merchant_id: config.merchantId,
                purchase_id: resolvedPurchaseId
            },
            headers: {
                'Authorization': `Token ${config.apiToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 20000
        });

        const statusData = statusResponse?.data;
        const paymentStatusResult = statusData?.data?.status; // e.g. "Approved" or "Rejected"
        logger.info(`[Mintpay] Status response for purchase ${resolvedPurchaseId}: status=${paymentStatusResult}`, statusData);

        if (paymentStatusResult === 'Approved') {
            if (normalizedOrderId) {
                await Order.updatePaymentStatus(normalizedOrderId, 'paid');
                await Order.updateOrderStatus(normalizedOrderId, 'confirmed');
                logger.info(`Mintpay Order ${normalizedOrderId} payment marked as PAID and CONFIRMED`);

                // Send confirmation email
                try {
                    await sendOrderConfirmationEmails(normalizedOrderId);
                } catch (err) {
                    logger.error('[Mintpay] Error sending confirmation email:', err);
                }
            }

            return res.status(200).json({
                success: true,
                payment_status: 'paid',
                data: statusData?.data
            });
        } else {
            if (normalizedOrderId) {
                await Order.updatePaymentStatus(normalizedOrderId, 'failed');
                logger.info(`Mintpay Order ${normalizedOrderId} payment marked as FAILED (status=${paymentStatusResult})`);
            }

            return res.status(200).json({
                success: true,
                payment_status: 'failed',
                data: statusData?.data
            });
        }
    } catch (error) {
        logger.error('[Mintpay] Error in verifyMintpayPayment:', {
            message: error?.message,
            status: error?.response?.status,
            data: error?.response?.data
        });
        res.status(500).json({ success: false, error: 'Mintpay payment verification failed' });
    }
};