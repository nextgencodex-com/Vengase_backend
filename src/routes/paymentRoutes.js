const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Generate WebxPay payment payload — called before redirect
router.post('/generate', paymentController.generatePaymentPayload);

// WebxPay callback URL — POSTed by WebxPay after payment completes
// Security: secret_key in body is validated inside the controller
router.post('/callback', paymentController.paymentCallback);
// Payzy endpoints
router.post('/payzy/generate', paymentController.generatePayzyPayload);
router.post('/payzy/verify', paymentController.verifyPayzyPayment);

module.exports = router;