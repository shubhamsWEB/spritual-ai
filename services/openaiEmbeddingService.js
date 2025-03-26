/**
 * OpenAI-based embedding service
 */
const axios = require('axios');
const configService = require('../utils/configService');
const logger = require('../utils/logger');

class EmbeddingService {
  constructor() {
    // Get embedding config from configService
    this.apiKey = process.env.OPENAI_API_KEY;
    if (!this.apiKey) {
      logger.warn('OPENAI_API_KEY not found in environment variables. Embeddings will fail.');
    }
    
    this.modelName = configService.get('embedding.openaiModel');
    this.dimensions = configService.get('embedding.dimensions');
    this.cache = new Map();
    this.useCache = configService.get('embedding.cache');
    this.initialized = !!this.apiKey;
    
    logger.info(`OpenAI Embedding service initialized with model: ${this.modelName}`);
  }

  /**
   * Get embedding for text
   * @param {string} text Text to embed
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async getEmbedding(text) {
    if (!text) {
      throw new Error('No text provided for embedding');
    }
    
    // Check cache first if enabled
    if (this.useCache && this.cache.has(text)) {
      return this.cache.get(text);
    }
    
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
    }
    
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          input: text,
          model: this.modelName
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const embedding = response.data.data[0].embedding;
      
      // Verify embedding dimensions
      if (!embedding || embedding.length === 0) {
        throw new Error('Embedding generation failed - empty embedding returned');
      }
      
      // Log success but only for the first few embeddings to avoid spamming logs
      if (!this.cache.has('_logged_success_')) {
        logger.info(`Successfully generated OpenAI embedding with ${embedding.length} dimensions`);
        this.cache.set('_logged_success_', true);
      }
      
      // Cache the result if caching is enabled
      if (this.useCache) {
        this.cache.set(text, embedding);
      }
      
      return embedding;
    } catch (error) {
      logger.error(`Error generating OpenAI embedding: ${error.message}`);
      if (error.response) {
        logger.error(`OpenAI API error: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Get query embedding (matches your Python code's method name)
   * @param {string} text Text to embed
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async get_query_embedding(text) {
    return this.getEmbedding(text);
  }

  /**
   * Generate embeddings for multiple texts
   * @param {Array<string>} texts Array of texts to embed
   * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
   */
  async getEmbeddings(texts) {
    if (!texts || texts.length === 0) {
      throw new Error('No texts provided for embedding');
    }
    
    // For small batches, process individually to leverage cache
    if (texts.length <= 5) {
      return Promise.all(texts.map(text => this.getEmbedding(text)));
    }
    
    // For larger batches, use the batch API
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          input: texts,
          model: this.modelName
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Sort embeddings by index to maintain original order
      const embeddings = response.data.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);
      
      // Cache results if enabled
      if (this.useCache) {
        texts.forEach((text, i) => {
          this.cache.set(text, embeddings[i]);
        });
      }
      
      return embeddings;
    } catch (error) {
      logger.error(`Error generating batch OpenAI embeddings: ${error.message}`);
      if (error.response) {
        logger.error(`OpenAI API error: ${JSON.stringify(error.response.data)}`);
      }
      
      // Fall back to individual processing
      return Promise.all(texts.map(text => this.getEmbedding(text)));
    }
  }

  /**
   * Calculate similarity between two texts
   * @param {string} text1 First text
   * @param {string} text2 Second text
   * @returns {Promise<number>} Similarity score (cosine similarity)
   */
  async calculateSimilarity(text1, text2) {
    try {
      const embedding1 = await this.getEmbedding(text1);
      const embedding2 = await this.getEmbedding(text2);
      
      return this._cosineSimilarity(embedding1, embedding2);
    } catch (error) {
      logger.error(`Error calculating similarity: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array<number>} vec1 First vector
   * @param {Array<number>} vec2 Second vector
   * @returns {number} Cosine similarity (between -1 and 1)
   * @private
   */
  _cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    // Prevent division by zero
    if (norm1 === 0 || norm2 === 0) return 0;
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Clear the embedding cache
   */
  clearCache() {
    if (this.cache) {
      this.cache.clear();
      logger.info('Embedding cache cleared');
    }
  }
}

module.exports = EmbeddingService; 