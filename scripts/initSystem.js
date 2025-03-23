/**
 * Script to initialize the system
 * Processes the Bhagavad Gita PDF and creates the vector index
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const config = require('config');
const logger = require('../utils/logger');
const DocumentProcessor = require('../services/documentProcessor');
const VectorStore = require('../services/vectorStore');
const RAGService = require('../services/ragService');

// File paths
const PDF_PATH = path.join(__dirname, '..', config.get('documents.pdfPath'));
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
    
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(modelCacheDir, { recursive: true });
    
    logger.info('Created required directories');
    
    // Check if PDF exists
    try {
      await fs.access(PDF_PATH);
      logger.info(`Found Bhagavad Gita PDF at: ${PDF_PATH}`);
    } catch (error) {
      logger.error(`PDF file not found at ${PDF_PATH}. Please make sure the file exists.`);
      process.exit(1);
    }
    
    // Initialize document processor
    const docProcessor = new DocumentProcessor(PDF_PATH);
    
    // Check if processed data exists
    let nodes;
    const useCache = config.get('documents.cacheEnabled');
    
    if (useCache) {
      logger.info('Attempting to load processed data from cache...');
      const cacheLoaded = await docProcessor.loadProcessedData(PROCESSED_DATA_PATH);
      
      if (cacheLoaded) {
        logger.info('Successfully loaded processed data from cache');
        nodes = docProcessor.nodes;
      } else {
        logger.info('Cache not available or invalid, processing PDF...');
        nodes = await docProcessor.processDocument();
        
        // Save processed data for future use
        await docProcessor.saveProcessedData(PROCESSED_DATA_PATH);
      }
    } else {
      logger.info('Cache disabled, processing PDF...');
      nodes = await docProcessor.processDocument();
    }
    
    // Initialize RAG system
    const ragService = new RAGService();
    await ragService.initialize(nodes);
    
    logger.info('System initialization complete!');
    logger.info(`Processed ${nodes.length} nodes from the Bhagavad Gita`);
    
    // Exit process
    process.exit(0);
  } catch (error) {
    logger.error(`Error initializing system: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
};

// Run the initialization
initSystem();