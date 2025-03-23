/**
 * Setup script to clean caches and install dependencies
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('Starting setup process...');

// Create model cache directory in project
const modelCacheDir = path.join(process.cwd(), 'model_cache');
if (!fs.existsSync(modelCacheDir)) {
  fs.mkdirSync(modelCacheDir, { recursive: true });
  console.log(`Created model cache directory: ${modelCacheDir}`);
}

// Create data directory if it doesn't exist
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
}

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log(`Created logs directory: ${logsDir}`);
}

// Clean up any existing cache locations
const cleanupLocations = [
  path.join(os.homedir(), '.cache', 'fastembed'),
  path.join(os.homedir(), '.cache', 'huggingface'),
  path.join(process.cwd(), 'local_cache')
];

for (const location of cleanupLocations) {
  if (fs.existsSync(location)) {
    console.log(`Found cache at ${location}, removing...`);
    try {
      fs.rmSync(location, { recursive: true, force: true });
      console.log(`Successfully removed ${location}`);
    } catch (error) {
      console.error(`Error removing ${location}: ${error.message}`);
    }
  }
}

// Install dependencies
console.log('\nInstalling/updating packages...');
try {
  // First uninstall fastembed if it exists
  try {
    execSync('npm uninstall fastembed', { stdio: 'inherit' });
  } catch (error) {
    // Ignore errors here
  }
  
  // Install latest fastembed
  execSync('npm install fastembed@latest', { stdio: 'inherit' });
  console.log('Successfully installed latest fastembed package');
  
  // Install other dependencies if needed
  execSync('npm install', { stdio: 'inherit' });
  console.log('Successfully installed all dependencies');
} catch (error) {
  console.error(`Error installing dependencies: ${error.message}`);
}

// Set environment variables
process.env.HF_HOME = modelCacheDir;
process.env.FASTEMBED_CACHE_PATH = modelCacheDir;

console.log('\nSetup completed successfully!');
console.log(`
Next steps:
1. Make sure you have added your Bhagavad Gita PDF to the data directory
2. Set your GROQ_API_KEY in the .env file
3. Run 'node scripts/testEmbedding.js' to test the embedding service
4. Run 'npm run init' to initialize the system
5. Start the server with 'npm run dev'
`);