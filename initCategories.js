// Simple script to initialize default categories
// Run this with: node initCategories.js

const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:5000/api/v1';

async function initializeCategories() {
  try {
    console.log('🔄 Initializing default categories...');
    
    // You'll need to replace this with your actual admin token
    // Get it from localStorage in browser after logging in as admin
    const adminToken = process.env.ADMIN_TOKEN || 'YOUR_ADMIN_TOKEN_HERE';
    
    const response = await fetch(`${API_BASE_URL}/categories/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Categories initialized successfully!');
      console.log(data);
    } else {
      console.error('❌ Error:', data.message || data);
    }
  } catch (error) {
    console.error('❌ Failed to initialize categories:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. Backend server is running on http://localhost:5000');
    console.log('   2. You have a valid admin token');
    console.log('   3. Firebase is properly configured');
  }
}

initializeCategories();
