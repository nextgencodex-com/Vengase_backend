const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Generate WebxPay payment payload — called before redirect
router.post('/generate', paymentController.generatePaymentPayload);

// WebxPay callback URL — POSTed by WebxPay after payment completes
// Security: secret_key in body is validated inside the controller
router.post('/callback', paymentController.paymentCallback);
router.get('/callback', paymentController.paymentCallback);
// Payzy endpoints
router.post('/payzy/generate', paymentController.generatePayzyPayload);
router.post('/payzy/verify', paymentController.verifyPayzyPayment);
router.get('/payzy/verify', paymentController.verifyPayzyPayment);
router.post('/payzy/callback', paymentController.verifyPayzyPayment);
router.get('/payzy/callback', paymentController.verifyPayzyPayment);

// Mintpay endpoints
router.post('/mintpay/generate', paymentController.generateMintpayPayload);
router.post('/mintpay/verify', paymentController.verifyMintpayPayment);
router.get('/mintpay/verify', paymentController.verifyMintpayPayment);
router.post('/mintpay/callback', paymentController.verifyMintpayPayment);
router.get('/mintpay/callback', paymentController.verifyMintpayPayment);

module.exports = router;