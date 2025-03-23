/**
 * Script to clean up corrupted model caches
 * Run this if you encounter model loading errors
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('Starting cache cleanup...');

// Define possible cache locations
const cacheLocations = [
  // Project local cache
  path.join(process.cwd(), 'local_cache'),
  path.join(process.cwd(), 'local_cache', 'BAAI'),
  path.join(process.cwd(), 'local_cache', 'fast-bge-base-en'),
  
  // FlagEmbedding default cache location
  path.join(os.homedir(), '.cache', 'fastembed'),
  path.join(os.homedir(), '.cache', 'fastembed', 'fast-bge-base-en'),
  
  // HuggingFace cache
  path.join(os.homedir(), '.cache', 'huggingface')
];

// Possible problematic files
const problematicFiles = [
  'fast-bge-base-en.tar.gz',
  'bge-small-en-v1.5.tar.gz'
];

// Check and clean each location
cacheLocations.forEach(location => {
  if (fs.existsSync(location)) {
    console.log(`Found cache directory: ${location}`);
    
    try {
      // Check for incomplete model directories (missing tokenizer.json)
      if (location.includes('fast-bge-base-en')) {
        const tokenizerPath = path.join(location, 'tokenizer.json');
        
        if (!fs.existsSync(tokenizerPath)) {
          console.log(`Found incomplete model directory at ${location}, removing...`);
          fs.rmSync(location, { recursive: true, force: true });
          console.log(`Removed incomplete model directory: ${location}`);
        } else {
          console.log(`Model directory at ${location} appears complete, keeping it`);
        }
      } else {
        // Check for problematic tar files
        const files = fs.readdirSync(location);
        
        problematicFiles.forEach(fileName => {
          if (files.includes(fileName)) {
            const filePath = path.join(location, fileName);
            console.log(`Found potentially problematic file: ${filePath}, removing...`);
            fs.unlinkSync(filePath);
            console.log(`Removed file: ${filePath}`);
          }
        });
      }
    } catch (error) {
      console.error(`Error processing ${location}: ${error.message}`);
    }
  } else {
    console.log(`Cache directory not found: ${location}`);
  }
});

// Create fresh directories for the model
try {
  // Create FlagEmbedding cache directory (this is where it actually looks)
  const flagEmbedCacheDir = path.join(os.homedir(), '.cache', 'fastembed');
  
  if (!fs.existsSync(flagEmbedCacheDir)) {
    fs.mkdirSync(flagEmbedCacheDir, { recursive: true });
    console.log(`Created FlagEmbed cache directory at ${flagEmbedCacheDir}`);
  }
  
  // Create project local cache directories
  const projectCacheDir = path.join(process.cwd(), 'local_cache');
  const projectModelDir = path.join(projectCacheDir, 'BAAI');
  
  if (!fs.existsSync(projectCacheDir)) {
    fs.mkdirSync(projectCacheDir, { recursive: true });
    console.log(`Created project cache directory at ${projectCacheDir}`);
  }
  
  if (!fs.existsSync(projectModelDir)) {
    fs.mkdirSync(projectModelDir, { recursive: true });
    console.log(`Created model cache directory at ${projectModelDir}`);
  }
} catch (error) {
  console.error(`Error creating directories: ${error.message}`);
}

console.log('Cache cleanup completed!');