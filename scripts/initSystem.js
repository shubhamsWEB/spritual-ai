/**
 * Script to initialize the system
 * Processes the Bhagavad Gita PDF and creates the vector index
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const configService = require('../utils/configService');
const logger = require('../utils/logger');
const DocumentProcessor = require('../services/GitaProcessor');
const VectorStore = require('../services/vectorStore');
const RAGService = require('../services/ragService');

// File paths
const PDF_PATH = path.join(__dirname, '..', configService.get('documents.pdfPath'));
const PROCESSED_DATA_PATH = path.join(__dirname, '..', 'data', 'processed_gita.json');

/**
 * Initialize the system
 */
const initSystem = async () => {
  try {
    logger.info('Starting system initialization...');
    
    // Create required directories
    const dataDir = path.join(__dirname, '..', 'data');
    const cacheDir = path.join(__dirname, '..', 'local_cache');
    const modelCacheDir = path.join(cacheDir, 'BAAI');
    const logsDir = path.join(__dirname, '..', 'logs');
    
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(modelCacheDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });
    
    logger.info('Created required directories');
    
    // Check if PDF exists
    try {
      await fs.access(PDF_PATH);
      logger.info(`Found Bhagavad Gita PDF at: ${PDF_PATH}`);
    } catch (error) {
      logger.error(`PDF file not found at ${PDF_PATH}. Please make sure the file exists.`);
      process.exit(1);
    }
    
    // Get PDF file stats
    const pdfStats = await fs.stat(PDF_PATH);
    logger.info(`PDF file size: ${(pdfStats.size / 1024).toFixed(2)} KB`);
    
    if (pdfStats.size === 0) {
      logger.error('PDF file is empty. Please provide a valid PDF file.');
      process.exit(1);
    }
    
    // Initialize document processor
    const docProcessor = new DocumentProcessor(PDF_PATH);
    
    // Check if processed data exists
    let nodes;
    const useCache = configService.get('documents.cacheEnabled');
    
    if (useCache) {
      try {
        const cachedData = await fs.readFile(PROCESSED_DATA_PATH, 'utf-8');
        nodes = JSON.parse(cachedData);
        logger.info(`Loaded ${nodes.length} nodes from cached data`);
      } catch (error) {
        logger.info('No cached processed data found or error reading cache. Processing PDF...');
        nodes = await docProcessor.process();
        
        // Save processed data for future use
        await fs.writeFile(PROCESSED_DATA_PATH, JSON.stringify(nodes, null, 2));
        logger.info(`Processed ${nodes.length} nodes and saved to cache`);
      }
    } else {
      logger.info('Cache disabled. Processing PDF...');
      nodes = await docProcessor.process();
      logger.info(`Processed ${nodes.length} nodes`);
    }
    
    // Initialize vector store
    const vectorStore = new VectorStore();
    await vectorStore.initializeCollection();
    logger.info('Vector store collection initialized');
    
    // Initialize RAG service
    const ragService = new RAGService();
    await ragService.initialize(nodes);
    logger.info('RAG service initialized');
    
    logger.info('System initialization completed successfully');
    
    // Return the RAG service for potential further use
    return ragService;
  } catch (error) {
    logger.error(`System initialization failed: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
};

// Run the initialization if this script is executed directly
if (require.main === module) {
  initSystem()
    .then(() => {
      logger.info('Initialization script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Initialization script failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = initSystem;