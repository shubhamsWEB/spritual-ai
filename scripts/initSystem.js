/**
 * Script to initialize the system
 * Processes the Bhagavad Gita PDF and creates the vector index
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const config = require('config');
const logger = require('../utils/logger');
const DocumentProcessor = require('../services/GitaProcessor');
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
    
    if (!nodes || nodes.length === 0) {
      logger.error('Failed to create document nodes. Check PDF format or processing logic.');
      process.exit(1);
    }
    
    logger.info(`Created ${nodes.length} document nodes for indexing`);
    
    // Initialize vector store
    logger.info('Initializing vector store...');
    const vectorStore = new VectorStore();
    
    try {
      // Initialize the collection
      await vectorStore.initializeCollection();
      
      // Check if collection already has documents
      const initialPointCount = await vectorStore.getPointCount();
      logger.info(`Vector collection initially contains ${initialPointCount} points`);
      
      if (initialPointCount > 0) {
        logger.info('Vector collection already contains documents.');
        const deleteExisting = process.env.FORCE_REINDEX === 'true';
        
        if (deleteExisting) {
          logger.info('Deleting existing collection...');
          await vectorStore.deleteCollection();
          await vectorStore.initializeCollection();
          logger.info('Recreated empty collection');
        } else {
          logger.info('Keeping existing documents. Set FORCE_REINDEX=true to reindex.');
        }
      }
      
      // Add nodes to vector store if needed
      if (initialPointCount === 0 || process.env.FORCE_REINDEX === 'true') {
        logger.info(`Adding ${nodes.length} nodes to vector store...`);
        
        // Process in smaller batches to avoid memory issues
        const batchSize = 5;
        for (let i = 0; i < nodes.length; i += batchSize) {
          const batch = nodes.slice(i, Math.min(i + batchSize, nodes.length));
          logger.info(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(nodes.length/batchSize)}: ${batch.length} nodes`);
          await vectorStore.addDocuments(batch);
          
          // Add garbage collection hint and small delay between batches
          if (global.gc) {
            global.gc();
          }
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to allow GC to work
        }
        
        // Verify documents were added
        const finalPointCount = await vectorStore.getPointCount();
        logger.info(`Vector collection now contains ${finalPointCount} points`);
        
        if (finalPointCount === 0) {
          logger.error('Failed to add documents to vector store. Check embedding process.');
        }
      }
    } catch (error) {
      logger.error(`Error initializing vector store: ${error.message}`);
      logger.error(error.stack);
      process.exit(1);
    }
    
    // Initialize and test RAG system
    logger.info('Initializing RAG system...');
    const ragService = new RAGService();
    
    try {
      await ragService.initialize([]); // Initialize without adding nodes again
      
      // Get system health to verify everything is working
      const health = await ragService.getSystemHealth();
      logger.info(`System health: ${JSON.stringify(health, null, 2)}`);
      
      // Test query if vector store has documents
      if (health.vectorStore.documentCount > 0) {
        logger.info('Testing RAG system with sample query...');
        const testQuery = 'What is karma according to the Bhagavad Gita?';
        
        try {
          const result = await ragService.query(testQuery);
          logger.info('RAG test query successful');
          logger.info(`Found ${result.sources.length} sources for query`);
          
          if (result.sources.length === 0) {
            logger.warn('No sources found for test query. Check vector search functionality.');
          }
        } catch (queryError) {
          logger.error(`Test query failed: ${queryError.message}`);
          logger.error(queryError.stack);
        }
      }
    } catch (error) {
      logger.error(`Error initializing RAG system: ${error.message}`);
      logger.error(error.stack);
    }
    
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