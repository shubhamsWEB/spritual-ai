/**
 * Vector store service for Qdrant integration
 */
const { QdrantClient } = require('@qdrant/js-client-rest');
const configService = require('../utils/configService');
const logger = require('../utils/logger');
// const EmbeddingService = require('./embeddingService');
const EmbeddingService = require('./openaiEmbeddingService');

class VectorStore {
  /**
   * Initialize the vector store
   */
  constructor() {
    // Get configuration
    const host = configService.get('vectorDB.host');
    const apiKey = configService.get('vectorDB.apiKey');

    // Initialize the client
    // Initialize the client - always use cloud
    this.client = new QdrantClient({
      url: `${host}`,
      apiKey
    });
    logger.info(`Initialized Qdrant client at ${host}`);


    this.collectionName = configService.get('vectorDB.collectionName');
    this.dimensions = configService.get('vectorDB.dimensions');
    this.distance = configService.get('vectorDB.distance');
    this.quantization = {
      enabled: configService.get('vectorDB.quantization.enabled'),
      type: configService.get('vectorDB.quantization.type'),
      rescore: configService.get('vectorDB.quantization.rescore')
    };

    // Initialize embedding service
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Initialize the collection
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

      logger.info(`Created collection ${this.collectionName}`);
    } catch (error) {
      logger.error(`Error initializing collection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add documents to the vector store
   * @param {Array} nodes Document nodes to add
   * @returns {Promise<void>}
   */
  async addDocuments(nodes) {
    if (!nodes || nodes.length === 0) {
      logger.warn('No nodes provided to add to vector store');
      return;
    }

    logger.info(`Adding ${nodes.length} nodes to vector store`);

    try {
      // Make sure the embedding service is initialized
      const embeddingService = this.embeddingService;

      // Process in batches to avoid overwhelming the server
      const batchSize = 20; // Reduced batch size to prevent memory issues

      for (let i = 0; i < nodes.length; i += batchSize) {
        const batch = nodes.slice(i, i + batchSize);
        const points = [];

        // Create embedding for each node
        for (let j = 0; j < batch.length; j++) {
          const node = batch[j];
          try {
            const embedding = await embeddingService.getEmbedding(node.text);

            // Convert string IDs to valid Qdrant IDs (integers or UUIDs)
            let nodeId;
            if (typeof node.id === 'number' && Number.isInteger(node.id) && node.id >= 0) {
              // Use as is if it's a positive integer
              nodeId = node.id;
            } else if (typeof node.id === 'string' &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.id)) {
              // Use as is if it's a UUID
              nodeId = node.id;
            } else {
              // Generate a numeric ID based on position
              nodeId = i + j;
            }

            points.push({
              id: nodeId,
              vector: embedding,
              payload: {
                original_id: node.id, // Store original ID in payload if needed
                text: node.text,
                metadata: node.metadata || {}
              }
            });
          } catch (error) {
            logger.error(`Error embedding node ${i + j}: ${error.message}`);
            // Continue with other nodes
          }
        }

        // Remove console.log in production code
        // console.log("🚀 ~ VectorStore ~ addDocuments ~ points:", JSON.stringify(points, null, 2));

        if (points.length === 0) {
          logger.warn(`No valid embeddings in batch ${i} to ${i + batchSize}`);
          continue;
        }

        try {
          // Add points to collection
          // Log a sample point to debug the structure
          if (points.length > 0) {
            logger.debug(`Sample point structure: ${JSON.stringify({
              id: points[0].id,
              vector_length: points[0].vector.length,
              payload_size: JSON.stringify(points[0].payload).length
            })}`);
          }

          await this.client.upsert(this.collectionName, {
            wait: true,
            points
          });

          logger.info(`Added batch of ${points.length} points to vector store (${i + points.length}/${nodes.length})`);
        } catch (error) {
          logger.error(`Error upserting batch to Qdrant: ${error.message}`);
          if (error.response && error.response.data) {
            logger.error(`Qdrant error details: ${JSON.stringify(error.response.data)}`);
          } else {
            // Log more details about the error
            logger.error(`Full error object: ${JSON.stringify(error)}`);

            // Check vector dimensions
            if (points.length > 0) {
              const vectorLength = points[0].vector.length;
              logger.error(`Vector dimensions: ${vectorLength}, expected: ${this.dimensions}`);

              // Check if any vectors are not arrays or have NaN values
              const invalidVectors = points.filter(p =>
                !Array.isArray(p.vector) ||
                p.vector.some(val => typeof val !== 'number' || isNaN(val))
              );
              if (invalidVectors.length > 0) {
                logger.error(`Found ${invalidVectors.length} invalid vectors`);
              }
            }
          }
          // Continue with other batches
        }
      }

      logger.info(`Successfully added nodes to vector store`);
    } catch (error) {
      logger.error(`Error adding documents to vector store: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search for relevant documents
   * @param {string} query Query string
   * @param {number} limit Maximum number of results
   * @returns {Promise<Array>} Search results
   */
  async search(query, limit = 5) {
    try {
      logger.info(`Searching for: "${query}" (limit: ${limit})`);

      // Get query embedding
      const queryEmbedding = await this.embeddingService.getEmbedding(query);

      // Search in collection
      const results = await this.client.search(this.collectionName, {
        vector: queryEmbedding,
        limit,
        with_payload: true
      });

      // Format results
      const formattedResults = results.map(hit => ({
        content: hit.payload.text,
        metadata: hit.payload.metadata,
        score: hit.score
      }));

      logger.info(`Found ${formattedResults.length} results for query`);
      return formattedResults;
    } catch (error) {
      logger.error(`Error searching vector store: ${error.message}`);
      throw error;
    }
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
   * Get collection info
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
}

module.exports = VectorStore;