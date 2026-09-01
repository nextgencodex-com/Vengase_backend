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
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

if (process.env.NODE_ENV === 'production') {
  const trustProxy = process.env.TRUST_PROXY;
  app.set('trust proxy', trustProxy ? trustProxy : 1);
}

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
    if (CORS_ALLOW_ALL) {
      return callback(null, true);
    }

    // Allow server-to-server requests (no Origin header) and allowlisted browsers.
    if (!origin || corsAllowlist.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Handle CORS preflight across all routes.
app.options('*', cors(corsOptions));

// Rate limiting (disabled for development). Limit API traffic only.
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 10000),
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => (
    req.method === 'OPTIONS' ||
    req.originalUrl === '/health' ||
    req.originalUrl.startsWith('/images') ||
    req.originalUrl.startsWith('/uploads') ||
    req.path === '/products/new-arrivals'
  ),
});

app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
// Product creation uploads base64 images, so the default JSON limit is too small.
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

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

// API Routes
if (process.env.NODE_ENV === 'production') {
  app.use('/api/v1', apiLimiter);
}

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

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📱 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
});

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
