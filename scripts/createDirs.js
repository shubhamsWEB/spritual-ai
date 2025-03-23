/**
 * Script to create required directories
 * Run this before the initialization script if you encounter directory errors
 */
const fs = require('fs');
const path = require('path');

console.log('Creating required directories...');

// Define required directories
const dirs = [
  'data',
  'logs',
  'local_cache',
  'local_cache/BAAI'
];

// Create each directory
dirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`Creating directory: ${fullPath}`);
    fs.mkdirSync(fullPath, { recursive: true });
  } else {
    console.log(`Directory already exists: ${fullPath}`);
  }
});

console.log('Directory creation complete!');