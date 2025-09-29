#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

async function setupProject() {
  console.log('🚀 Setting up Vengase Backend Project...\n');

  try {
    // Get Firebase configuration
    const projectId = await question('Enter your Firebase Project ID: ');
    const storageBucket = await question('Enter your Firebase Storage Bucket (or press Enter for default): ') || `${projectId}.appspot.com`;
    
    // Create .env file
    const envContent = `# Firebase Configuration
FIREBASE_PROJECT_ID=${projectId}
FIREBASE_STORAGE_BUCKET=${storageBucket}

# Server Configuration
PORT=5000
NODE_ENV=development

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Upload Configuration
MAX_FILE_SIZE=5MB
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/webp

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# API Configuration
API_VERSION=v1
API_PREFIX=/api
`;

    fs.writeFileSync('.env', envContent);
    console.log('✅ Created .env file');

    // Create logs directory
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log('✅ Created logs directory');
    }

    // Create uploads directory
    const uploadsDir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('✅ Created uploads directory');
    }

    console.log('\n🎉 Project setup completed!');
    console.log('\nNext steps:');
    console.log('1. Place your Firebase service account key in config/serviceAccountKey.json');
    console.log('2. Run: npm install');
    console.log('3. Run: npm run dev');
    console.log('\n📚 Check docs/API.md for API documentation');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  } finally {
    rl.close();
  }
}

setupProject();