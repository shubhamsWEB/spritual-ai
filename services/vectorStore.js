/**
 * Enhanced Vector store service for Qdrant integration
 * Includes improved error handling, batching, and debugging
 */
const { QdrantClient } = require('@qdrant/js-client-rest');
const configService = require('../utils/configService');
const logger = require('../utils/logger');
const EmbeddingService = require('./openaiEmbeddingService');

class VectorStore {
  /**
   * Initialize the vector store
   */
  constructor() {
    // Get configuration
    const host = configService.get('vectorDB.host');
    const apiKey = configService.get('vectorDB.apiKey');

    // Initialize the client with improved error handling
    this.client = new QdrantClient({
      url: `${host}`,
      apiKey
    });
    
    this.collectionName = configService.get('vectorDB.collectionName');
    this.dimensions = configService.get('vectorDB.dimensions');
    this.distance = configService.get('vectorDB.distance');
    this.quantization = {
      enabled: configService.get('vectorDB.quantization.enabled'),
      type: configService.get('vectorDB.quantization.type'),
      rescore: configService.get('vectorDB.quantization.rescore')
    };
    
    // Batch size for document addition
    this.addBatchSize = configService.get('vectorDB.batchSize') || 10;
    
    // Maximum retries for Qdrant operations
    this.maxRetries = configService.get('vectorDB.maxRetries') || 3;
    
    // Debug mode
    this.debugMode = configService.get('vectorDB.debug') || false;
    
    // Initialize embedding service
    this.embeddingService = new EmbeddingService();
    
    // Track operations for debugging
    this.operationStats = {
      addedDocuments: 0,
      failedDocuments: 0,
      searches: 0,
      errors: []
    };
    
    logger.info(`Initialized Qdrant client at ${host} for collection ${this.collectionName}`);
  }

  getKnowledgeBase() {
    return this.collectionName;
  }

  /**
   * Initialize the collection with improved error handling
   * @returns {Promise<void>}
   */
  async initializeCollection() {
    try {
      // Check if collection exists
      let collections;
      logger.info(`Checking if collection ${this.collectionName} exists`);

      try {
        collections = await this.client.getCollections();
      } catch (error) {
        logger.error(`Failed to connect to Qdrant: ${error.message}`);
        throw new Error(`Failed to connect to Qdrant: ${error.message}`);
      }

      const collectionExists = collections.collections.some(
        collection => collection.name === this.collectionName
      );

      if (collectionExists) {
        logger.info(`Collection ${this.collectionName} already exists`);
        
        // If debug mode is enabled, get collection info for verification
        if (this.debugMode) {
          try {
            const collectionInfo = await this.getCollectionInfo();
            logger.info(`Collection ${this.collectionName} info: ${JSON.stringify({
              vectors_count: collectionInfo.vectors_count,
              points_count: collectionInfo.points_count,
              vector_size: collectionInfo.config?.params?.vectors?.size
            })}`);
          } catch (infoError) {
            logger.warn(`Could not get collection info: ${infoError.message}`);
          }
        }
        
        return;
      }

      // Create the collection with updated parameters
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: this.dimensions,
          distance: this.distance
        },
        quantization_config: this.quantization.enabled ? {
            scalar: {
                type: "int8",
                quantile: 0.99,
                always_ram: true,
              },
        } : undefined
      });

      logger.info(`Created collection ${this.collectionName} with ${this.dimensions} dimensions`);
      
      // Create payload index for metadata fields for better filtering
      const metadataFields = ['chapter', 'verse', 'doc_type'];
      
      for (const field of metadataFields) {
        try {
          await this.client.createPayloadIndex(this.collectionName, {
            field_name: `metadata.${field}`,
            field_schema: 'integer' // Adjust based on actual field types
          });
          logger.info(`Created payload index for metadata.${field}`);
        } catch (indexError) {
          logger.warn(`Could not create index for metadata.${field}: ${indexError.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error initializing collection: ${error.message}`);
      if (error.response && error.response.data) {
        logger.error(`Qdrant error details: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Add documents to the vector store with improved batching and error handling
   * @param {Array} nodes Document nodes to add
   * @returns {Promise<Object>} Result of the operation
   */
  async addDocuments(nodes) {
    if (!nodes || nodes.length === 0) {
      logger.warn('No nodes provided to add to vector store');
      return { success: false, message: 'No nodes provided' };
    }

    logger.info(`Adding ${nodes.length} nodes to vector store in batches of ${this.addBatchSize}`);
    
    // Track operation results
    const results = {
      success: true,
      total: nodes.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    try {
      // Process in batches to avoid overwhelming the server
      for (let i = 0; i < nodes.length; i += this.addBatchSize) {
        const batch = nodes.slice(i, i + this.addBatchSize);
        logger.info(`Processing batch ${Math.floor(i/this.addBatchSize) + 1}/${Math.ceil(nodes.length/this.addBatchSize)} (${batch.length} nodes)`);
        
        try {
          // Create points with properly validated data
          const points = await this._createPointsFromNodes(batch);
          
          // If no valid points were created, continue to next batch
          if (points.length === 0) {
            logger.warn(`No valid points created from batch ${i} to ${i + this.addBatchSize}`);
            results.processed += batch.length;
            results.failed += batch.length;
            continue;
          }
          
          // Add points to collection without retry logic
          await this.client.upsert(this.collectionName, {
            wait: true,
            points
          });
          
          results.processed += batch.length;
          results.succeeded += points.length;
          
          if (points.length < batch.length) {
            results.failed += (batch.length - points.length);
          }
          
          this.operationStats.addedDocuments += points.length;
          
          logger.info(`Successfully added batch of ${points.length} points to vector store (${results.processed}/${nodes.length})`);
          
          // Add a small delay between batches to reduce load
          if (i + this.addBatchSize < nodes.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          logger.error(`Error adding batch to vector store: ${error.message}`);
          
          if (error.response && error.response.data) {
            logger.error(`Qdrant error details: ${JSON.stringify(error.response.data)}`);
          }
          
          results.processed += batch.length;
          results.failed += batch.length;
          results.errors.push({
            batch: Math.floor(i/this.addBatchSize) + 1,
            message: error.message
          });
          
          this.operationStats.failedDocuments += batch.length;
          this.operationStats.errors.push({
            operation: 'addDocuments',
            message: error.message,
            batch: Math.floor(i/this.addBatchSize) + 1
          });
        }
        
        // Force garbage collection between batches (if running with --expose-gc)
        if (global.gc) {
          global.gc();
          logger.info('Garbage collection triggered');
        }
      }

      if (results.failed > 0) {
        results.success = false;
        results.message = `Completed with ${results.failed} failed nodes out of ${nodes.length}`;
      } else {
        results.message = `Successfully added ${results.succeeded} nodes to vector store`;
      }
      
      logger.info(results.message);
      return results;
    } catch (error) {
      logger.error(`Error in overall document addition process: ${error.message}`);
      this.operationStats.errors.push({
        operation: 'addDocuments',
        message: error.message,
        global: true
      });
      return {
        success: false,
        total: nodes.length,
        processed: results.processed,
        succeeded: results.succeeded,
        failed: nodes.length - results.succeeded,
        message: error.message
      };
    }
  }

  /**
   * Create points from nodes with proper validation and error handling
   * @param {Array} nodes Document nodes
   * @returns {Promise<Array>} Points for Qdrant
   * @private
   */
  async _createPointsFromNodes(nodes) {
    try {
      const points = [];
      
      // Create embedding for each node with individual error handling
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        
        try {
          // Validate required fields
          if (!node.text || typeof node.text !== 'string' || node.text.trim().length === 0) {
            logger.warn(`Node at index ${i} has no valid text, skipping`);
            continue;
          }
          
          // Generate embedding
          const embedding = await this.embeddingService.getEmbedding(node.text);
          
          // Validate embedding
          if (!embedding || !Array.isArray(embedding) || embedding.length !== this.dimensions) {
            logger.warn(`Invalid embedding for node at index ${i}: expected ${this.dimensions} dimensions, got ${embedding ? embedding.length : 'none'}`);
            continue;
          }
          
          // Create a valid ID
          const id = this._createConsistentId(node.id, i);
          
          // Create payload with validation
          const payload = {
            text: node.text.substring(0, 8000), // Limit text size for Qdrant
            metadata: node.metadata || {}
          };
          
          // Ensure metadata is an object
          if (typeof payload.metadata !== 'object') {
            payload.metadata = {};
          }
          
          // Add original ID to payload if using a generated ID
          if (node.id && id !== node.id) {
            payload.original_id = node.id;
          }
          
          points.push({
            id,
            vector: embedding,
            payload
          });
        } catch (error) {
          logger.error(`Error processing node ${i}: ${error.message}`);
          // Continue with other nodes
        }
      }
      
      if (this.debugMode && points.length > 0) {
        // Log a sample point for debugging
        const samplePoint = { ...points[0] };
        if (samplePoint.vector) {
          samplePoint.vector = samplePoint.vector.slice(0, 3).concat(['...']);
        }
        logger.debug(`Sample point structure: ${JSON.stringify(samplePoint, null, 2)}`);
      }
      
      return points;
    } catch (error) {
      logger.error(`Error creating points from nodes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a consistent ID for Qdrant
   * @param {any} originalId Original ID
   * @param {number} fallbackIndex Fallback index
   * @returns {string|number} Consistent ID
   * @private
   */
  _createConsistentId(originalId, fallbackIndex) {
    // If it's already a positive integer, use it
    if (typeof originalId === 'number' && Number.isInteger(originalId) && originalId >= 0) {
      return originalId;
    }
    
    // If it's a UUID, use it
    if (typeof originalId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(originalId)) {
      return originalId;
    }
    
    // If it's a string that can be converted to a positive integer, convert it
    if (typeof originalId === 'string') {
      const parsedId = parseInt(originalId, 10);
      if (!isNaN(parsedId) && parsedId >= 0) {
        return parsedId;
      }
      
      // Hash the string to create a numeric ID
      return this._hashString(originalId);
    }
    
    // Fallback to using the index
    return fallbackIndex;
  }

  /**
   * Hash a string to create a numeric ID
   * @param {string} str String to hash
   * @returns {number} Hashed numeric ID
   * @private
   */
  _hashString(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Ensure the hash is positive
    return Math.abs(hash);
  }

  /**
   * Search for relevant documents with improved relevance scoring
   * @param {string} query Query string
   * @param {number} limit Maximum number of results
   * @param {Object} filters Optional filters for search
   * @returns {Promise<Array>} Search results
   */
  async search(query, limit = 20, filters = null) {
    try {
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Invalid query: query must be a non-empty string');
      }
      
      logger.info(`Searching for: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}" (limit: ${limit})`);
      this.operationStats.searches++;
      
      // Get query embedding without retry logic
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      
      // Prepare search parameters
      const searchParams = {
        vector: queryEmbedding,
        limit: Math.min(limit, 100), // Cap at 100 for performance
        with_payload: true,
        with_vectors: false, // Don't return vectors to save bandwidth
        score_threshold: 0.2 // Minimum relevance score
      };
      
      // Add filters if provided
      if (filters) {
        searchParams.filter = this._buildQdrantFilter(filters);
      }
      
      // Search in collection without retry
      const results = await this.client.search(this.collectionName, searchParams);
      
      // Format and enhance results
      const formattedResults = results.map(hit => {
        // Handle missing payload
        const payload = hit.payload || {};
        
        return {
          content: payload.text || '',
          metadata: payload.metadata || {},
          score: hit.score,
          id: hit.id,
          original_id: payload.original_id || hit.id
        };
      });
      
      // Filter out results with empty content
      const validResults = formattedResults.filter(result => result.content.trim().length > 0);
      
      // Calculate statistics about results
      const scores = validResults.map(r => r.score);
      const stats = {
        count: validResults.length,
        avgScore: scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0,
        maxScore: scores.length > 0 ? Math.max(...scores) : 0,
        minScore: scores.length > 0 ? Math.min(...scores) : 0
      };
      
      if (this.debugMode) {
        logger.info(`Search stats: ${JSON.stringify(stats)}`);
      }

      logger.info(`Found ${validResults.length} results for query with avg score ${stats.avgScore.toFixed(3)}`);
      return validResults;
    } catch (error) {
      logger.error(`Error searching vector store: ${error.message}`);
      this.operationStats.errors.push({
        operation: 'search',
        message: error.message,
        query: query.substring(0, 100)
      });
      throw error;
    }
  }

  /**
   * Build a Qdrant filter from a simplified filter object
   * @param {Object} filters Filter object
   * @returns {Object} Qdrant filter
   * @private
   */
  _buildQdrantFilter(filters) {
    if (!filters || typeof filters !== 'object') {
      return null;
    }
    
    // Build filter conditions
    const conditions = [];
    
    // Process metadata filters
    if (filters.metadata && typeof filters.metadata === 'object') {
      for (const [key, value] of Object.entries(filters.metadata)) {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            // Match any value in the array
            conditions.push({
              any: value.map(v => ({
                key: `metadata.${key}`,
                match: { value: v }
              }))
            });
          } else {
            // Match exact value
            conditions.push({
              key: `metadata.${key}`,
              match: { value }
            });
          }
        }
      }
    }
    
    // Filter by chapter if specified
    if (filters.chapter) {
      conditions.push({
        key: 'metadata.chapter',
        match: { value: filters.chapter }
      });
    }
    
    // Filter by verse if specified
    if (filters.verse) {
      conditions.push({
        key: 'metadata.verse',
        match: { value: filters.verse }
      });
    }
    
    // Filter by document type if specified
    if (filters.doc_type) {
      if (Array.isArray(filters.doc_type)) {
        conditions.push({
          any: filters.doc_type.map(type => ({
            key: 'metadata.doc_type',
            match: { value: type }
          }))
        });
      } else {
        conditions.push({
          key: 'metadata.doc_type',
          match: { value: filters.doc_type }
        });
      }
    }
    
    // If no conditions, return null
    if (conditions.length === 0) {
      return null;
    }
    
    // Return filter with all conditions
    return { must: conditions };
  }

  /**
   * Delete a collection and all its data
   * @returns {Promise<void>}
   */
  async deleteCollection() {
    try {
      await this.client.deleteCollection(this.collectionName);
      logger.info(`Deleted collection ${this.collectionName}`);
    } catch (error) {
      logger.error(`Error deleting collection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get collection info with improved error handling
   * @returns {Promise<Object>} Collection info
   */
  async getCollectionInfo() {
    try {
      const info = await this.client.getCollection(this.collectionName);
      return info;
    } catch (error) {
      logger.error(`Error getting collection info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the number of points in the collection
   * @returns {Promise<number>} Point count
   */
  async getPointCount() {
    try {
      const info = await this.getCollectionInfo();
      return info.points_count;
    } catch (error) {
      logger.error(`Error getting point count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Test the vector store with a sample query
   * @param {string} query Sample query
   * @returns {Promise<Object>} Test results
   */
  async testSearch(query = "What does Krishna teach about karma yoga?") {
    try {
      logger.info(`Testing vector store with query: "${query}"`);
      
      // First check if collection exists and has points
      let pointCount = 0;
      try {
        pointCount = await this.getPointCount();
      } catch (error) {
        return {
          success: false,
          message: `Collection check failed: ${error.message}`,
          query
        };
      }
      
      if (pointCount === 0) {
        return {
          success: false,
          message: `Collection is empty, no points to search`,
          query
        };
      }
      
      // Try to generate an embedding
      let embedding;
      try {
        embedding = await this.embeddingService.getEmbedding(query);
      } catch (error) {
        return {
          success: false,
          message: `Embedding generation failed: ${error.message}`,
          query
        };
      }
      
      // Try to search
      const results = await this.search(query, 5);
      
      return {
        success: true,
        query,
        results: results.map(r => ({
          score: r.score,
          content: r.content.substring(0, 100) + (r.content.length > 100 ? '...' : ''),
          metadata: r.metadata
        })),
        pointCount,
        embeddingDimensions: embedding.length,
        collectionName: this.collectionName,
        stats: this.operationStats
      };
    } catch (error) {
      logger.error(`Vector store test failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
        query
      };
    }
  }

  /**
   * Get system statistics
   * @returns {Object} System statistics
   */
  getStats() {
    return {
      ...this.operationStats,
      embeddingStats: this.embeddingService.getCacheStats(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = VectorStore;