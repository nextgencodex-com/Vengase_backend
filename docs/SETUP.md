# Vengase Backend Setup Guide

This guide will help you set up the Vengase backend with Firebase.

## Step 1: Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a project" or use an existing project
3. Enter project name (e.g., "vengase-ecommerce")
4. Choose whether to enable Google Analytics (optional)
5. Click "Create project"

## Step 2: Register Web App

1. In your Firebase project dashboard, click the **Web** icon (`</>`) to add a web app
2. Enter an app nickname (e.g., "Vengase Web App")
3. Choose "Use npm" for setup method
4. **Optional**: Check "Also set up Firebase Hosting" if you plan to deploy to Firebase Hosting
5. Click "Register app"
6. You'll see the Firebase config object - **save this for your frontend React app**:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSyBhEF3QHBbn2SYZcV7P8j3BAqHpjQFxv4U",
     authDomain: "vengase-ecommerce.firebaseapp.com",
     projectId: "vengase-ecommerce",
     storageBucket: "vengase-ecommerce.firebasestorage.app",
     messagingSenderId: "483369530435",
     appId: "1:483369530435:web:09d1a623a0f9b2322d10f6",
     measurementId: "G-WH6QYJ1L5D"
   };
   ```
7. Click "Continue to console"

## Step 3: Enable Firebase Services

### Firestore Database
1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (for development)
4. Select a location closest to your users
5. Click "Done"

### Firebase Storage
1. Go to "Storage" in Firebase Console
2. Click "Get started"
3. Start in test mode
4. Choose the same location as Firestore
5. Click "Done"

### Authentication
1. Go to "Authentication" in Firebase Console
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" provider
5. Click "Save"

## Step 4: Service Account Setup

1. Go to Project Settings (gear icon) → "Service accounts"
2. Click "Generate new private key"
3. Save the downloaded JSON file as `config/serviceAccountKey.json` in your project
4. **Important**: Never commit this file to version control!

## Step 5: Environment Configuration

1. Copy `.env.example` to `.env`
2. Update the following variables with your Firebase project details:
   ```env
   FIREBASE_PROJECT_ID=vengase-ecommerce
   FIREBASE_STORAGE_BUCKET=vengase-ecommerce.firebasestorage.app
   ```

## Step 6: Install and Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Step 7: Create First Admin User

1. Create a user account through Firebase Authentication console
2. Note the user's UID
3. Run this code in Firebase Functions or use the Admin SDK to set custom claims:

```javascript
const admin = require('firebase-admin');

// Set admin custom claim
await admin.auth().setCustomUserClaims('USER_UID_HERE', { 
  admin: true 
});
```

Or use the API after creating at least one admin manually:
```bash
POST /api/v1/auth/create-admin
{
  "email": "admin@example.com",
  "password": "secure-password",
  "displayName": "Admin User"
}
```

## Step 8: Seed Database (Optional)

To populate your database with sample products:

```bash
node scripts/seedDatabase.js
```

## Step 9: Test the API

Visit `http://localhost:5000/health` to check if the server is running.

### Test Product Endpoints:
- GET `http://localhost:5000/api/v1/products` - Get all products
- GET `http://localhost:5000/api/v1/categories` - Get categories

## Security Setup (Production)

### Firestore Security Rules
Replace the default rules with:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Products are readable by all, writable by admins only
    match /products/{productId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    
    // Other collections require authentication
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Storage Security Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /products/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

## Troubleshooting

### Common Issues:

1. **Firebase not initialized**: Make sure `serviceAccountKey.json` is in the correct location
2. **Permission denied**: Check if your Firestore rules allow the operation
3. **Storage upload fails**: Verify Storage rules and bucket configuration
4. **Admin routes fail**: Ensure user has admin custom claims set

### Getting Help:

- Check the logs in the `logs/` directory
- Review the API documentation in `docs/API.md`
- Ensure all environment variables are correctly set

## Frontend Integration

### For Your React App (vengase-website):

1. **Install Firebase SDK in your React project:**
   ```bash
   cd ../vengase-website
   npm install firebase
   ```

2. **Create Firebase configuration file** (`src/config/firebase.js`):
   ```javascript
   // Import the functions you need from the SDKs you need
   import { initializeApp } from "firebase/app";
   import { getAuth } from "firebase/auth";
   import { getStorage } from "firebase/storage";
   import { getAnalytics } from "firebase/analytics";

   // Your web app's Firebase configuration
   const firebaseConfig = {
     apiKey: "AIzaSyBhEF3QHBbn2SYZcV7P8j3BAqHpjQFxv4U",
     authDomain: "vengase-ecommerce.firebaseapp.com",
     projectId: "vengase-ecommerce",
     storageBucket: "vengase-ecommerce.firebasestorage.app",
     messagingSenderId: "483369530435",
     appId: "1:483369530435:web:09d1a623a0f9b2322d10f6",
     measurementId: "G-WH6QYJ1L5D"
   };

   // Initialize Firebase
   const app = initializeApp(firebaseConfig);

   // Initialize Firebase services
   export const auth = getAuth(app);
   export const storage = getStorage(app);
   export const analytics = getAnalytics(app);
   export default app;
   ```

3. **Update your product data source** - Replace the static `src/data/products.js` with API calls:
   ```javascript
   // src/services/api.js
   const API_BASE_URL = 'http://localhost:5000/api/v1';

   export const productAPI = {
     // Get all products
     getProducts: async (filters = {}) => {
       const params = new URLSearchParams(filters);
       const response = await fetch(`${API_BASE_URL}/products?${params}`);
       return response.json();
     },

     // Get single product
     getProduct: async (id) => {
       const response = await fetch(`${API_BASE_URL}/products/${id}`);
       return response.json();
     },

     // Search products
     searchProducts: async (term) => {
       const response = await fetch(`${API_BASE_URL}/products/search/${term}`);
       return response.json();
     },

     // Get products by category
     getProductsByCategory: async (category) => {
       const response = await fetch(`${API_BASE_URL}/products/category/${category}`);
       return response.json();
     }
   };
   ```

## Next Steps

1. ✅ Backend API is ready with Firebase
2. 🔄 Update your React components to use the API instead of static data
3. 🔄 Implement Firebase Authentication in your React app for admin features
4. 🔄 Add product management interface for admins
5. 🔄 Implement cart and checkout functionality
6. 🔄 Add user reviews and ratings system

## API Base URL

Development: `http://localhost:5000/api/v1`
Production: Update with your deployed URL