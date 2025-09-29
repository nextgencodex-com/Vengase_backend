# Vengase Backend - Firebase E-commerce API

A comprehensive Firebase-based backend API for the Vengase e-commerce platform, built with Node.js, Express, and Firebase Admin SDK.

## Features

- **Product Management**: Full CRUD operations for products with categories, stock management, and search
- **Firebase Integration**: Firestore for data storage and Firebase Storage for images
- **Image Processing**: Automatic image optimization with Sharp (resize, convert to WebP)
- **Authentication**: Firebase Authentication with admin role management
- **File Upload**: Secure image upload to Firebase Storage
- **API Validation**: Request validation using Joi
- **Error Handling**: Comprehensive error handling and logging
- **Rate Limiting**: Protection against API abuse
- **Documentation**: Complete API documentation
- **Testing**: Unit and integration tests

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Firebase Firestore
- **Storage**: Firebase Storage
- **Authentication**: Firebase Auth
- **Image Processing**: Sharp
- **Validation**: Joi
- **Logging**: Winston
- **Testing**: Jest & Supertest

## Project Structure

```
src/
├── controllers/     # Route handlers and business logic
├── middleware/      # Authentication and error handling
├── models/         # Data models and Firestore operations
├── routes/         # API route definitions
├── services/       # External service integrations
├── utils/          # Utility functions and helpers
├── validators/     # Request validation schemas
└── data/           # Sample data for seeding

config/             # Firebase and app configuration
docs/              # API documentation
logs/              # Application logs
public/            # Static file uploads
scripts/           # Setup and utility scripts
tests/             # Test files
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Firebase project with Firestore and Storage enabled
- Firebase service account key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Vengase_backend
```

2. Install dependencies:
```bash
npm install
```

3. Run the setup script:
```bash
node scripts/setup.js
```

4. Configure Firebase:
   - Place your Firebase service account key in `config/serviceAccountKey.json`
   - Update the `.env` file with your Firebase configuration

5. Start the development server:
```bash
npm run dev
```

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Firestore Database
3. Enable Firebase Storage
4. Enable Authentication (Email/Password)
5. Generate a service account key:
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save as `config/serviceAccountKey.json`

## Database Schema

### Products Collection
```javascript
{
  id: "auto-generated",
  name: "Product Name",
  price: 29.99,
  description: "Short description",
  detailedDescription: "Long description",
  category: "tops", // tops, bottoms, jewelry, accessories, etc.
  fabric: "Cotton",
  features: ["Feature 1", "Feature 2"],
  colors: ["Black", "White"],
  stock: {
    "S": 10,
    "M": 15,
    "L": 20,
    "XL": 5
  },
  status: "instock", // instock, outofstock, discontinued
  img: "https://storage.googleapis.com/...",
  rating: 4.5,
  reviews: 24,
  createdAt: "2025-01-28T10:00:00.000Z",
  updatedAt: "2025-01-28T10:00:00.000Z"
}
```

## API Endpoints

### Base URL: `http://localhost:5000/api/v1`

#### Products
- `GET /products` - Get all products with filtering
- `GET /products/:id` - Get specific product
- `POST /products` - Create product (Admin)
- `PUT /products/:id` - Update product (Admin)
- `DELETE /products/:id` - Delete product (Admin)
- `GET /products/search/:term` - Search products

#### Categories
- `GET /categories` - Get all categories
- `GET /categories/stats` - Get category statistics

#### Upload
- `POST /upload/image` - Upload single image (Admin)
- `POST /upload/images` - Upload multiple images (Admin)

## Seeding the Database

To populate your database with sample products:
```bash
node scripts/seedDatabase.js
```

## Scripts

- `npm start`: Start production server
- `npm run dev`: Start development server with nodemon
- `npm test`: Run tests
- `node scripts/setup.js`: Initial project setup

## License

This project is licensed under the MIT License. 
