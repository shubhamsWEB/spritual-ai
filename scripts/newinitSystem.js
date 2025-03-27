/**
 * Enhanced initialization script for the Bhagavad Gita RAG system
 * Uses the improved GitaDocumentProcessor with better error handling and debugging
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const configService = require('../utils/configService');
const logger = require('../utils/logger');
const GitaDocumentProcessor = require('../services/GitaProcessor');
const VectorStore = require('../services/vectorStore');
const RAGService = require('../services/ragService');

// File paths
const PDF_PATH = path.join(__dirname, '..', configService.get('documents.pdfPath'));
const PROCESSED_DATA_PATH = path.join(__dirname, '..', 'data', 'processed_gita.json');
const DEBUG_PATH = path.join(__dirname, '..', 'data', 'init_debug.json');

/**
 * Initialize the system with improved error handling and debugging
 */
const initSystem = async () => {
  // Track timing for performance analysis
  const startTime = Date.now();
  const timings = {};
  
  // Track debug information
  const debugInfo = {
    config: {
      pdfPath: PDF_PATH,
      dataPath: PROCESSED_DATA_PATH,
      cacheEnabled: configService.get('documents.cacheEnabled'),
      forceReindex: process.env.FORCE_REINDEX === 'true'
    },
    timings: {},
    errors: [],
    stages: {}
  };
  
  try {
    logger.info('Starting enhanced Bhagavad Gita system initialization...');
    
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
    
    // Check if PDF exists with detailed error handling
    try {
      await fs.access(PDF_PATH);
      const pdfStats = await fs.stat(PDF_PATH);
      
      logger.info(`Found Bhagavad Gita PDF at: ${PDF_PATH}`);
      logger.info(`PDF file size: ${(pdfStats.size / 1024).toFixed(2)} KB`);
      
      debugInfo.stages.pdfCheck = {
        success: true,
        size: pdfStats.size,
        path: PDF_PATH
      };
      
      if (pdfStats.size === 0) {
        throw new Error('PDF file is empty');
      }
    } catch (error) {
      const errorMsg = `PDF check failed: ${error.message}`;
      logger.error(errorMsg);
      debugInfo.errors.push({
        stage: 'pdfCheck',
        error: error.message,
        path: PDF_PATH
      });
      debugInfo.stages.pdfCheck = {
        success: false,
        error: error.message
      };
      
      // Save debug info before exiting
      await fs.writeFile(DEBUG_PATH, JSON.stringify(debugInfo, null, 2));
      
      process.exit(1);
    }
    
    // Initialize Gita document processor with enhanced capabilities
    const gitaProcessor = new GitaDocumentProcessor(PDF_PATH);
    logger.info('Initialized GitaDocumentProcessor with enhanced patterns and processing');
    
    // Check if processed data exists
    let nodes;
    const useCache = configService.get('documents.cacheEnabled');
    
    if (useCache) {
      const cacheStart = Date.now();
      logger.info('Attempting to load processed data from cache...');
      
      const cacheLoaded = await gitaProcessor.loadProcessedData(PROCESSED_DATA_PATH);
      
      timings.cacheLoad = Date.now() - cacheStart;
      debugInfo.timings.cacheLoad = timings.cacheLoad;
      
      if (cacheLoaded) {
        logger.info(`Successfully loaded processed data from cache in ${timings.cacheLoad}ms`);
        nodes = gitaProcessor.nodes;
        
        // Log statistics about loaded nodes
        const nodeTypes = {};
        nodes.forEach(node => {
          const type = node.metadata.doc_type;
          nodeTypes[type] = (nodeTypes[type] || 0) + 1;
        });
        
        logger.info(`Loaded ${nodes.length} nodes with distribution: ${JSON.stringify(nodeTypes)}`);
        
        debugInfo.stages.cacheLoad = {
          success: true,
          nodesLoaded: nodes.length,
          distribution: nodeTypes
        };
      } else {
        logger.info('Cache not available or invalid, processing PDF...');
        
        debugInfo.stages.cacheLoad = {
          success: false,
          reason: 'Cache not available or invalid'
        };
        
        // Process in stages to better isolate potential issues
        try {
          const extractStart = Date.now();
          await gitaProcessor.extractTextFromPdf();
          timings.textExtraction = Date.now() - extractStart;
          debugInfo.timings.textExtraction = timings.textExtraction;
          logger.info(`Extracted text from PDF in ${timings.textExtraction}ms`);
          
          // Run a diagnostic extraction test for debugging
          const testResult = await gitaProcessor.testExtraction(1, 1);
          debugInfo.stages.extractionTest = testResult;
          
          const structureStart = Date.now();
          await gitaProcessor.structureGitaText();
          timings.textStructuring = Date.now() - structureStart;
          debugInfo.timings.textStructuring = timings.textStructuring;
          logger.info(`Structured text in ${timings.textStructuring}ms`);
          
          const nodeStart = Date.now();
          nodes = await gitaProcessor.createGitaNodes();
          timings.nodeCreation = Date.now() - nodeStart;
          debugInfo.timings.nodeCreation = timings.nodeCreation;
          logger.info(`Created nodes in ${timings.nodeCreation}ms`);
          
          // Save processed data for future use
          const saveStart = Date.now();
          await gitaProcessor.saveProcessedData(PROCESSED_DATA_PATH);
          timings.dataSave = Date.now() - saveStart;
          debugInfo.timings.dataSave = timings.dataSave;
          logger.info(`Saved processed data in ${timings.dataSave}ms`);
          
          debugInfo.stages.pdfProcessing = {
            success: true,
            structuredDocs: gitaProcessor.structuredDocs.length,
            nodes: nodes.length
          };
        } catch (processingError) {
          const errorMsg = `PDF processing failed: ${processingError.message}`;
          logger.error(errorMsg);
          logger.error(processingError.stack);
          
          debugInfo.errors.push({
            stage: 'pdfProcessing',
            error: processingError.message,
            stack: processingError.stack
          });
          
          debugInfo.stages.pdfProcessing = {
            success: false,
            error: processingError.message
          };
          
          // Save debug info before exiting
          await fs.writeFile(DEBUG_PATH, JSON.stringify(debugInfo, null, 2));
          
          process.exit(1);
        }
      }
    } else {
      logger.info('Cache disabled, processing PDF...');
      
      // Process the PDF with full steps but no caching
      try {
        const processStart = Date.now();
        nodes = await gitaProcessor.processGitaDocument();
        timings.pdfProcessing = Date.now() - processStart;
        debugInfo.timings.pdfProcessing = timings.pdfProcessing;
        
        logger.info(`Processed PDF in ${timings.pdfProcessing}ms`);
        
        // Save processed data for future use
        const saveStart = Date.now();
        await gitaProcessor.saveProcessedData(PROCESSED_DATA_PATH);
        timings.dataSave = Date.now() - saveStart;
        debugInfo.timings.dataSave = timings.dataSave;
        
        logger.info(`Saved processed data in ${timings.dataSave}ms`);
        
        debugInfo.stages.pdfProcessing = {
          success: true,
          structuredDocs: gitaProcessor.structuredDocs.length,
          nodes: nodes.length
        };
      } catch (processingError) {
        const errorMsg = `PDF processing failed: ${processingError.message}`;
        logger.error(errorMsg);
        logger.error(processingError.stack);
        
        debugInfo.errors.push({
          stage: 'pdfProcessing',
          error: processingError.message,
          stack: processingError.stack
        });
        
        debugInfo.stages.pdfProcessing = {
          success: false,
          error: processingError.message
        };
        
        // Save debug info before exiting
        await fs.writeFile(DEBUG_PATH, JSON.stringify(debugInfo, null, 2));
        
        process.exit(1);
      }
    }
    
    if (!nodes || nodes.length === 0) {
      const errorMsg = 'Failed to create document nodes. Check PDF format or processing logic.';
      logger.error(errorMsg);
      
      debugInfo.errors.push({
        stage: 'nodeValidation',
        error: errorMsg
      });
      
      // Save debug info before exiting
      await fs.writeFile(DEBUG_PATH, JSON.stringify(debugInfo, null, 2));
      
      process.exit(1);
    }
    
    logger.info(`Created ${nodes.length} document nodes for indexing`);
    
    // Initialize vector store with error handling
    logger.info('Initializing vector store...');
    const vectorStore = new VectorStore();
    
    try {
      const vectorStart = Date.now();
      
      // Initialize the collection
      await vectorStore.initializeCollection();
      
      // Check if collection already has documents
      const initialPointCount = await vectorStore.getPointCount();
      logger.info(`Vector collection initially contains ${initialPointCount} points`);
      
      debugInfo.stages.vectorStoreInit = {
        success: true,
        initialPoints: initialPointCount
      };
      
      if (initialPointCount > 0) {
        logger.info('Vector collection already contains documents.');
        const deleteExisting = process.env.FORCE_REINDEX === 'true';
        
        if (deleteExisting) {
          logger.info('Deleting existing collection...');
          await vectorStore.deleteCollection();
          await vectorStore.initializeCollection();
          logger.info('Recreated empty collection');
          
          debugInfo.stages.collectionReset = {
            success: true,
            action: 'deleted and recreated'
          };
        } else {
          logger.info('Keeping existing documents. Set FORCE_REINDEX=true to reindex.');
          
          debugInfo.stages.collectionReset = {
            success: true,
            action: 'kept existing documents'
          };
        }
      }
      
      // Add nodes to vector store if needed
      if (initialPointCount === 0 || process.env.FORCE_REINDEX === 'true') {
        logger.info(`Adding ${nodes.length} nodes to vector store...`);
        
        const indexStart = Date.now();
        
        // Process in smaller batches with detailed progress tracking
        const batchSize = 10; // Smaller batches for better error isolation
        let successfulNodes = 0;
        let failedNodes = 0;
        
        for (let i = 0; i < nodes.length; i += batchSize) {
          const batch = nodes.slice(i, Math.min(i + batchSize, nodes.length));
          logger.info(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(nodes.length/batchSize)}: ${batch.length} nodes`);
          
          try {
            const batchResult = await vectorStore.addDocuments(batch);
            
            if (batchResult.success) {
              successfulNodes += batchResult.succeeded;
            } else {
              successfulNodes += batchResult.succeeded;
              failedNodes += batchResult.failed;
              
              logger.warn(`Batch ${Math.floor(i/batchSize) + 1} had ${batchResult.failed} failed nodes: ${batchResult.message}`);
              
              debugInfo.errors.push({
                stage: 'vectorStoreIndexing',
                batch: Math.floor(i/batchSize) + 1,
                message: batchResult.message,
                failed: batchResult.failed
              });
            }
          } catch (batchError) {
            logger.error(`Error processing batch ${Math.floor(i/batchSize) + 1}: ${batchError.message}`);
            failedNodes += batch.length;
            
            debugInfo.errors.push({
              stage: 'vectorStoreIndexing',
              batch: Math.floor(i/batchSize) + 1,
              error: batchError.message
            });
          }
          
          // Add garbage collection hint and small delay between batches
          if (global.gc) {
            global.gc();
          }
          await new Promise(resolve => setTimeout(resolve, 200)); // Small delay to allow GC to work
          
          // Report progress every 100 nodes
          if (i % 100 === 0 && i > 0) {
            logger.info(`Progress: ${i}/${nodes.length} nodes processed (${successfulNodes} successful, ${failedNodes} failed)`);
          }
        }
        
        timings.vectorIndexing = Date.now() - indexStart;
        debugInfo.timings.vectorIndexing = timings.vectorIndexing;
        
        logger.info(`Vector indexing completed in ${timings.vectorIndexing}ms (${successfulNodes} successful, ${failedNodes} failed)`);
        
        // Verify documents were added
        const finalPointCount = await vectorStore.getPointCount();
        logger.info(`Vector collection now contains ${finalPointCount} points`);
        
        debugInfo.stages.vectorStoreIndexing = {
          success: finalPointCount > 0,
          nodesProcessed: nodes.length,
          successful: successfulNodes,
          failed: failedNodes,
          finalPoints: finalPointCount
        };
        
        if (finalPointCount === 0) {
          logger.error('Failed to add documents to vector store. Check embedding process.');
          
          debugInfo.errors.push({
            stage: 'vectorStoreIndexing',
            error: 'Failed to add any documents to vector store'
          });
        }
      }
      
      timings.vectorStore = Date.now() - vectorStart;
      debugInfo.timings.vectorStore = timings.vectorStore;
      
    } catch (error) {
      logger.error(`Error initializing vector store: ${error.message}`);
      logger.error(error.stack);
      
      debugInfo.errors.push({
        stage: 'vectorStore',
        error: error.message,
        stack: error.stack
      });
      
      debugInfo.stages.vectorStore = {
        success: false,
        error: error.message
      };
      
      // Save debug info before exiting
      await fs.writeFile(DEBUG_PATH, JSON.stringify(debugInfo, null, 2));
      
      process.exit(1);
    }
    
    // Initialize and test RAG system
    logger.info('Initializing RAG system...');
    const ragStart = Date.now();
    const ragService = new RAGService();
    
    try {
      await ragService.initialize([]); // Initialize without adding nodes again
      
      // Get system health to verify everything is working
      const health = await ragService.getSystemHealth();
      logger.info(`System health: ${JSON.stringify(health, null, 2)}`);
      
      debugInfo.stages.ragInitialization = {
        success: true,
        health
      };
      
      // Test query if vector store has documents
      if (health.vectorStore.documentCount > 0) {
        logger.info('Testing RAG system with sample query...');
        const testQuery = 'What is karma yoga according to the Bhagavad Gita?';
        
        try {
          const queryStart = Date.now();
          const result = await ragService.query(testQuery);
          timings.testQuery = Date.now() - queryStart;
          debugInfo.timings.testQuery = timings.testQuery;
          
          logger.info(`RAG test query completed in ${timings.testQuery}ms`);
          logger.info(`Found ${result.sources.length} sources for query`);
          
          debugInfo.stages.ragTest = {
            success: true,
            query: testQuery,
            sourcesFound: result.sources.length,
            responseLength: result.answer.length
          };
          
          if (result.sources.length === 0) {
            logger.warn('No sources found for test query. Check vector search functionality.');
            
            debugInfo.stages.ragTest.warning = 'No sources found for test query';
          }
        } catch (queryError) {
          logger.error(`Test query failed: ${queryError.message}`);
          logger.error(queryError.stack);
          
          debugInfo.errors.push({
            stage: 'ragTest',
            error: queryError.message,
            stack: queryError.stack
          });
          
          debugInfo.stages.ragTest = {
            success: false,
            query: testQuery,
            error: queryError.message
          };
        }
      }
      
      timings.rag = Date.now() - ragStart;
      debugInfo.timings.rag = timings.rag;
      
    } catch (error) {
      logger.error(`Error initializing RAG system: ${error.message}`);
      logger.error(error.stack);
      
      debugInfo.errors.push({
        stage: 'ragInitialization',
        error: error.message,
        stack: error.stack
      });
      
      debugInfo.stages.ragInitialization = {
        success: false,
        error: error.message
      };
    }
    
    // Calculate and log total timing
    const totalDuration = Date.now() - startTime;
    timings.total = totalDuration;
    debugInfo.timings.total = totalDuration;
    
    logger.info(`System initialization complete in ${totalDuration}ms!`);
    logger.info(`Processed ${nodes.length} nodes from the Bhagavad Gita`);
    
    // Log detailed timing breakdown
    logger.info('Timing breakdown:');
    Object.entries(timings).forEach(([stage, time]) => {
      logger.info(`  ${stage}: ${time}ms (${Math.round(time/totalDuration*100)}% of total)`);
    });
    
    // Save debug info
    debugInfo.success = debugInfo.errors.length === 0;
    await fs.writeFile(DEBUG_PATH, JSON.stringify(debugInfo, null, 2));
    logger.info(`Debug information saved to ${DEBUG_PATH}`);
    
    // Exit process
    process.exit(0);
  } catch (error) {
    logger.error(`Error in system initialization: ${error.message}`);
    logger.error(error.stack);
    
    debugInfo.errors.push({
      stage: 'overall',
      error: error.message,
      stack: error.stack
    });
    
    debugInfo.success = false;
    
    // Save debug info before exiting
    await fs.writeFile(DEBUG_PATH, JSON.stringify(debugInfo, null, 2));
    
    process.exit(1);
  }
};

// Run the initialization
initSystem();

// Run initialization if this script is executed directly
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