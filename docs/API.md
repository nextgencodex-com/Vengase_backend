# Vengase Backend API Documentation

## Overview
Firebase-based backend API for the Vengase e-commerce platform, built with Node.js and Express.

## Base URL
```
http://localhost:5000/api/v1
```

## Authentication
All admin routes require Firebase ID token in the Authorization header:
```
Authorization: Bearer <firebase-id-token>
```

## API Endpoints

### Health Check
#### GET /health
Returns server status and basic information.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-01-28T10:00:00.000Z",
  "uptime": 3600,
  "environment": "development"
}
```

---

### Products

#### GET /api/v1/products
Get all products with optional filtering and pagination.

**Query Parameters:**
- `category` (string): Filter by category
- `status` (string): Filter by status (instock, outofstock, discontinued)
- `minPrice` (number): Minimum price filter
- `maxPrice` (number): Maximum price filter
- `sortBy` (string): Sort field (price, name, createdAt)
- `sortOrder` (string): Sort order (asc, desc)
- `limit` (number): Number of items per page (default: 50)
- `offset` (number): Number of items to skip (default: 0)

**Response:**
```json
{
  "success": true,
  "count": 25,
  "data": [
    {
      "id": "product123",
      "name": "VUN Logo T-Shirt",
      "price": 29.99,
      "description": "Premium cotton t-shirt with embroidered VUN logo",
      "category": "tops",
      "status": "instock",
      "stock": {
        "S": 5,
        "M": 8,
        "L": 12,
        "XL": 3
      },
      "img": "https://storage.googleapis.com/...",
      "createdAt": "2025-01-28T10:00:00.000Z",
      "updatedAt": "2025-01-28T10:00:00.000Z"
    }
  ]
}
```

#### GET /api/v1/products/:id
Get a specific product by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "product123",
    "name": "VUN Logo T-Shirt",
    "price": 29.99,
    "description": "Premium cotton t-shirt with embroidered VUN logo",
    "detailedDescription": "Experience ultimate comfort with our VUN Logo T-Shirt...",
    "category": "tops",
    "fabric": "100% Premium Cotton",
    "features": ["100% Cotton", "Pre-shrunk", "Machine Washable"],
    "colors": ["Black", "White", "Gray"],
    "status": "instock",
    "stock": {
      "S": 5,
      "M": 8,
      "L": 12,
      "XL": 3
    },
    "img": "https://storage.googleapis.com/...",
    "rating": 4.5,
    "reviews": 24,
    "createdAt": "2025-01-28T10:00:00.000Z",
    "updatedAt": "2025-01-28T10:00:00.000Z"
  }
}
```

#### POST /api/v1/products
Create a new product. **Requires admin authentication.**

**Request Body:**
```json
{
  "name": "New Product",
  "price": 39.99,
  "description": "Product description",
  "detailedDescription": "Detailed product description",
  "category": "tops",
  "fabric": "Cotton",
  "features": ["Feature 1", "Feature 2"],
  "colors": ["Black", "White"],
  "stock": {
    "S": 10,
    "M": 15,
    "L": 20,
    "XL": 5
  },
  "img": "https://storage.googleapis.com/...",
  "status": "instock"
}
```

#### PUT /api/v1/products/:id
Update an existing product. **Requires admin authentication.**

#### DELETE /api/v1/products/:id
Delete a product. **Requires admin authentication.**

#### GET /api/v1/products/search/:term
Search products by name, description, fabric, or features.

#### GET /api/v1/products/category/:category
Get products by category.

#### PATCH /api/v1/products/:id/stock
Update product stock. **Requires admin authentication.**

**Request Body:**
```json
{
  "stock": {
    "S": 15,
    "M": 20,
    "L": 25,
    "XL": 10
  }
}
```

---

### Categories

#### GET /api/v1/categories
Get all categories with product counts.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "tops",
      "displayName": "Tops",
      "productCount": 15
    },
    {
      "name": "bottoms",
      "displayName": "Bottoms",
      "productCount": 8
    }
  ]
}
```

#### GET /api/v1/categories/stats
Get category statistics including product counts and average prices.

---

### File Upload

#### POST /api/v1/upload/image
Upload a single image. **Requires admin authentication.**

**Request:**
- Content-Type: multipart/form-data
- Field name: `image`
- Supported formats: JPEG, PNG, WebP
- Max file size: 5MB

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://storage.googleapis.com/...",
    "fileName": "products/uuid-timestamp.webp",
    "size": 245760
  }
}
```

#### POST /api/v1/upload/images
Upload multiple images. **Requires admin authentication.**

**Request:**
- Content-Type: multipart/form-data
- Field name: `images`
- Max 10 files
- Supported formats: JPEG, PNG, WebP
- Max file size: 5MB each

#### DELETE /api/v1/upload/image/:fileName
Delete an uploaded image. **Requires admin authentication.**

---

### Authentication

#### POST /api/v1/auth/create-admin
Create a new admin user. **Requires existing admin authentication.**

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "securepassword",
  "displayName": "Admin Name"
}
```

#### GET /api/v1/auth/verify-admin
Verify admin token and permissions.

#### GET /api/v1/auth/profile
Get current user profile.

#### POST /api/v1/auth/revoke-admin
Revoke admin access from a user. **Requires admin authentication.**

---

## Error Responses

All error responses follow this format:
```json
{
  "success": false,
  "error": "Error message description"
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

## Rate Limiting
- 100 requests per 15-minute window per IP address
- Applies to all endpoints

## File Upload Guidelines
- Images are automatically resized to max 800x1000 pixels
- All images are converted to WebP format for optimization
- Original aspect ratio is maintained
- Files are stored in Firebase Storage with public access

## Authentication Setup
1. Create a Firebase project
2. Enable Authentication with Email/Password
3. Generate service account key
4. Set custom claims for admin users:
   ```javascript
   admin.auth().setCustomUserClaims(uid, { admin: true })
   ```