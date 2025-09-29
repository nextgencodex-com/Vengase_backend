const admin = require('firebase-admin');
const logger = require('../src/utils/logger');

let db = null;
let bucket = null;

const initializeFirebase = () => {
  try {
    // Initialize Firebase Admin SDK
    if (process.env.NODE_ENV === 'production') {
      // Production: Use environment variables
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          clientId: process.env.FIREBASE_CLIENT_ID,
          authUri: process.env.FIREBASE_AUTH_URI,
          tokenUri: process.env.FIREBASE_TOKEN_URI,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    } else {
      // Development: Use service account key file
      const serviceAccount = require('./serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`,
      });
    }

    // Initialize Firestore
    db = admin.firestore();
    
    // Initialize Storage
    bucket = admin.storage().bucket();

    logger.info('✅ Firebase initialized successfully');
    logger.info(`📦 Storage bucket: ${bucket.name}`);
    
  } catch (error) {
    logger.error('❌ Firebase initialization failed:', error);
    process.exit(1);
  }
};

const getFirestore = () => {
  if (!db) {
    throw new Error('Firestore not initialized. Call initializeFirebase() first.');
  }
  return db;
};

const getStorage = () => {
  if (!bucket) {
    throw new Error('Storage not initialized. Call initializeFirebase() first.');
  }
  return bucket;
};

const getAuth = () => {
  return admin.auth();
};

module.exports = {
  initializeFirebase,
  getFirestore,
  getStorage,
  getAuth,
  admin
};