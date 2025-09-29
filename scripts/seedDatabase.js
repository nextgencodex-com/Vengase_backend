#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { products } = require('../src/data/sampleProducts');
const Product = require('../src/models/Product');

// Initialize Firebase (for local testing)
require('dotenv').config();
const { initializeFirebase } = require('../config/firebase');

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Initialize Firebase
    initializeFirebase();
    console.log('✅ Firebase initialized');

    let successCount = 0;
    let errorCount = 0;

    for (const productData of products) {
      try {
        // Remove the id field as it will be auto-generated
        const { id, ...productWithoutId } = productData;
        
        const product = await Product.create({
          ...productWithoutId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`✅ Created product: ${product.name}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to create product ${productData.name}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Seeding completed!');
    console.log(`✅ Successfully created: ${successCount} products`);
    console.log(`❌ Failed: ${errorCount} products`);

  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  }
}

// Check if running directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };