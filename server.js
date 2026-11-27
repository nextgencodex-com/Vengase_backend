require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import configurations
const { initializeFirebase } = require('./config/firebase');
const logger = require('./src/utils/logger');

// Import routes
const productRoutes = require('./src/routes/productRoutes');
const categoryRoutes = require('./src/routes/categoryRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const authRoutes = require('./src/routes/authRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const promoCodeRoutes = require('./src/routes/promoCodeRoutes');
const newsletterRoutes = require('./src/routes/newsletterRoutes');
const contactRoutes = require('./src/routes/contactRoutes');

// Import middleware
const errorHandler = require('./src/middleware/errorHandler');
const notFound = require('./src/middleware/notFound');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Firebase
initializeFirebase();

// Middleware
// Allow image/static assets to be loaded by the frontend when served from a different origin.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false
}));

// Trust proxy unconditionally for accurate client IP resolution behind load balancers/CDNs
app.set('trust proxy', process.env.TRUST_PROXY || 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://vengase.com',
  'https://www.vengase.com',
  'https://webxpay.com',
  'https://stagingxpay.info'
];

const corsAllowlist = Array.from(new Set([...defaultOrigins, ...allowedOrigins]));
const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || 'false').toLowerCase() === 'true';

const corsOptions = {
  origin: (origin, callback) => {
    if (CORS_ALLOW_ALL && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // Allow server-to-server requests (no Origin header) and allowlisted browsers.
    if (!origin || corsAllowlist.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: !(CORS_ALLOW_ALL && process.env.NODE_ENV !== 'production'),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Handle CORS preflight across all routes.
app.options('*', cors(corsOptions));

// Rate limiting: Protect sensitive operations while allowing seamless product catalog browsing
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000;

const apiLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  skip: (req) => (
    process.env.NODE_ENV === 'test' ||
    req.method === 'OPTIONS' ||
    req.originalUrl === '/health' ||
    req.originalUrl.startsWith('/images') ||
    req.originalUrl.startsWith('/uploads') ||
    (req.method === 'GET' && (
      req.originalUrl.includes('/products') ||
      req.originalUrl.includes('/categories')
    ))
  ),
});

// Strict rate limiter for auth, contact, newsletter, and promo code validation
const strictPublicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.STRICT_RATE_LIMIT_MAX || 25),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    error: 'Too many requests. Please wait a few minutes before trying again.'
  }
});

// Checkout & payment initiation rate limiter
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CHECKOUT_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    error: 'Too many checkout or payment requests. Please try again shortly.'
  }
});

app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Apply large 25MB body limit ONLY to product/upload routes that handle base64 images; keep global limit at 1MB.
const largeBodyParser = express.json({ limit: '25mb' });
app.use('/api/v1/products', largeBodyParser);
app.use('/api/v1/upload', largeBodyParser);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Static files - serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
// Prefer backend-managed images (includes email logo), fallback to frontend images for compatibility.
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/images', express.static(path.join(__dirname, '../vengase-website/public/images')));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Prevent browser, proxy, and CDN caching of dynamic API and private data responses
app.use('/api/v1', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// API Routes & Rate Limiters
app.use('/api/v1', apiLimiter);
app.use('/api/v1/auth/register', strictPublicLimiter);
app.use('/api/v1/auth/signin', strictPublicLimiter);
app.use('/api/v1/contact/send', strictPublicLimiter);
app.use('/api/v1/newsletter/subscribe', strictPublicLimiter);
app.use('/api/v1/promo-codes/validate', strictPublicLimiter);
app.use('/api/v1/orders', checkoutLimiter);
app.use('/api/v1/payment', checkoutLimiter);

app.use('/api/v1/products', productRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/promo-codes', promoCodeRoutes);
app.use('/api/v1/newsletter', newsletterRoutes);
app.use('/api/v1/contact', contactRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server (skip auto-listen when imported by test runner)
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📱 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
    require('./src/services/mintpayReconciler').startMintpayReconciler();
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;
