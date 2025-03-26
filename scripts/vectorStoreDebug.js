/**
 * Script to debug vector store issues
 * Run this to check the status of your vector database and diagnose issues
 */
require('dotenv').config();

const configService = require('../utils/configService');
const logger = require('../utils/logger');
const VectorStore = require('../services/vectorStore');
const EmbeddingService = require('../services/customEmbeddingService');
const fs = require('fs').promises;
const path = require('path');

/**
 * Function to debug vector store issues
 */
async function debugVectorStore() {
  try {
    console.log('========== VECTOR STORE DEBUG TOOL ==========');
    console.log('Checking system configuration and status...');
    
    // 1. Check environment variables
    console.log('\n--- Environment Variables ---');
    const requiredEnvVars = ['GROQ_API_KEY'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      console.log(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
    } else {
      console.log('✓ All required environment variables are set');
    }
    
    // Check Qdrant configuration
    console.log('\n--- Qdrant Configuration ---');
    console.log(`Memory Mode: ${configService.get('vectorDB.memoryMode') ? 'Enabled' : 'Disabled'}`);
    console.log(`Collection Name: ${configService.get('vectorDB.collectionName')}`);
    console.log(`Dimensions: ${configService.get('vectorDB.dimensions')}`);
    console.log(`Distance Metric: ${configService.get('vectorDB.distance')}`);
    console.log(`Quantization: ${configService.get('vectorDB.quantization.enabled') ? 'Enabled' : 'Disabled'}`);
    
    // 2. Check PDF file
    console.log('\n--- PDF File Check ---');
    const pdfPath = path.join(__dirname, '..', configService.get('documents.pdfPath'));
    try {
      const pdfStats = await fs.stat(pdfPath);
      console.log(`✓ PDF file found: ${pdfPath}`);
      console.log(`  Size: ${(pdfStats.size / 1024).toFixed(2)} KB`);
      console.log(`  Modified: ${pdfStats.mtime}`);
      
      if (pdfStats.size === 0) {
        console.log(`❌ Warning: PDF file is empty`);
      }
    } catch (error) {
      console.log(`❌ PDF file not found at: ${pdfPath}`);
      console.log(`  Error: ${error.message}`);
    }
    
    // 3. Check processed data cache
    console.log('\n--- Processed Data Check ---');
    const processedDataPath = path.join(__dirname, '..', 'data', 'processed_gita.json');
    try {
      const dataStats = await fs.stat(processedDataPath);
      console.log(`✓ Processed data found: ${processedDataPath}`);
      console.log(`  Size: ${(dataStats.size / 1024).toFixed(2)} KB`);
      console.log(`  Modified: ${dataStats.mtime}`);
      
      // Read a sample of the data
      const dataContent = await fs.readFile(processedDataPath, 'utf8');
      try {
        const parsedData = JSON.parse(dataContent);
        console.log(`  Documents: ${parsedData.structuredDocs?.length || 0}`);
        console.log(`  Nodes: ${parsedData.nodes?.length || 0}`);
        
        if (!parsedData.nodes || parsedData.nodes.length === 0) {
          console.log(`❌ Warning: No nodes found in processed data`);
        }
      } catch (parseError) {
        console.log(`❌ Error parsing processed data: ${parseError.message}`);
      }
    } catch (error) {
      console.log(`❌ Processed data not found at: ${processedDataPath}`);
      console.log(`  Error: ${error.message}`);
    }
    
    // 4. Test embedding service
    console.log('\n--- Embedding Service Test ---');
    try {
      const embeddingService = new EmbeddingService();
      console.log('Initialized embedding service');
      
      // Generate a test embedding
      console.log('Generating test embedding...');
      const testText = "What is karma according to Bhagavad Gita?";
      const startTime = Date.now();
      const embedding = await embeddingService.getEmbedding(testText);
      const endTime = Date.now();
      
      console.log(`✓ Generated embedding in ${endTime - startTime}ms`);
      console.log(`  Dimensions: ${embedding.length}`);
      console.log(`  First 5 values: ${embedding.slice(0, 5).map(v => v.toFixed(6)).join(', ')}`);
      
      // Check dimensions
      if (embedding.length !== configService.get('vectorDB.dimensions')) {
        console.log(`❌ Warning: Embedding dimensions (${embedding.length}) do not match vector store configuration (${configService.get('vectorDB.dimensions')})`);
      }
    } catch (error) {
      console.log(`❌ Embedding service test failed: ${error.message}`);
      console.log(error.stack);
    }
    
    // 5. Test vector store
    console.log('\n--- Vector Store Test ---');
    try {
      const vectorStore = new VectorStore();
      console.log('Initialized vector store');
      
      // Check collection
      try {
        console.log('Checking collection status...');
        const info = await vectorStore.getCollectionInfo();
        console.log(`✓ Collection exists: ${configService.get('vectorDB.collectionName')}`);
        console.log(`  Points count: ${info.vectors_count}`);
        console.log(`  Dimensions: ${info.config?.params?.vectors?.size}`);
        console.log(`  Status: ${info.status}`);
        
        if (info.vectors_count === 0) {
          console.log(`❌ Warning: Collection is empty`);
        }
        
        // Test search if points exist
        if (info.vectors_count > 0) {
          console.log('\nTesting vector search...');
          const testQuery = "What is karma according to Bhagavad Gita?";
          const searchResults = await vectorStore.search(testQuery, 3);
          console.log(`✓ Search returned ${searchResults.length} results`);
          
          if (searchResults.length > 0) {
            console.log('First result:');
            console.log(`  Score: ${searchResults[0].score.toFixed(6)}`);
            console.log(`  Content: ${searchResults[0].content.substring(0, 100)}...`);
            console.log(`  Metadata: ${JSON.stringify(searchResults[0].metadata)}`);
          } else {
            console.log(`❌ Warning: No search results found`);
          }
        }
      } catch (collectionError) {
        console.log(`❌ Collection check failed: ${collectionError.message}`);
        console.log('Attempting to create collection...');
        
        try {
          await vectorStore.initializeCollection();
          console.log('✓ Successfully created collection');
        } catch (createError) {
          console.log(`❌ Failed to create collection: ${createError.message}`);
        }
      }
    } catch (error) {
      console.log(`❌ Vector store test failed: ${error.message}`);
      console.log(error.stack);
    }
    
    console.log('\n--- Recommendations ---');
    console.log('Based on the tests, here are some recommendations:');
    console.log('1. If the PDF file is missing or empty, add it to the data directory');
    console.log('2. If the processed data is missing, run the initialization script');
    console.log('3. If the collection is empty, run the following commands:');
    console.log('   - FORCE_REINDEX=true node scripts/initSystem.js');
    console.log('4. If embeddings have incorrect dimensions, check the embedding model and vector store config');
    console.log('5. For other issues, check the logs in the logs directory');
    
    console.log('\n========== DEBUG COMPLETE ==========');
  } catch (error) {
    console.error('Error running debug tool:', error);
    logger.error(`Vector store debug failed: ${error.message}`);
  }
}

// Run if called directly
if (require.main === module) {
  debugVectorStore()
    .then(() => {
      console.log('\nDebug completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Debug process failed:', error);
      process.exit(1);
    });
}

module.exports = debugVectorStore;
debugVectorStore();