/**
 * Enhanced OpenAI-based embedding service with better error handling and optimization
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
    
    this.modelName = configService.get('embedding.openaiModel') || 'text-embedding-ada-002';
    this.dimensions = configService.get('embedding.dimensions') || 1536;
    this.cache = new Map();
    this.useCache = configService.get('embedding.cache') !== false;
    this.initialized = !!this.apiKey;
    this.retryCount = configService.get('embedding.retryCount') || 3;
    this.retryDelay = configService.get('embedding.retryDelay') || 1000;
    this.batchSize = configService.get('embedding.batchSize') || 5;
    
    // Track API usage for debugging
    this.stats = {
      apiCalls: 0,
      totalTokens: 0,
      cacheHits: 0,
      errors: 0
    };
    
    logger.info(`OpenAI Embedding service initialized with model: ${this.modelName}, dimensions: ${this.dimensions}`);
  }

  /**
   * Preprocess text before embedding to improve quality
   * @param {string} text Text to preprocess
   * @returns {string} Preprocessed text
   * @private
   */
  _preprocessText(text) {
    if (!text) return '';
    
    // Remove excessive whitespace
    let processed = text.replace(/\s+/g, ' ').trim();
    
    // Standardize common Bhagavad Gita terms and phrases
    const standardizations = {
      'Bhagavad-gita': 'Bhagavad Gita',
      'Bhagavad-Gita': 'Bhagavad Gita',
      'Bhagavad-gétä': 'Bhagavad Gita',
      'Bhagavad-Gétä': 'Bhagavad Gita',
      'Çrémad-Bhägavatam': 'Srimad Bhagavatam',
      'Çrémad Bhägavatam': 'Srimad Bhagavatam',
      'Kåñëa': 'Krishna',
      'Çré Kåñëa': 'Sri Krishna',
      'Arjuna': 'Arjuna'
    };
    
    // Apply standardizations
    for (const [original, standardized] of Object.entries(standardizations)) {
      processed = processed.replace(new RegExp(original, 'g'), standardized);
    }
    
    // Remove copyright and other boilerplate text that might appear
    processed = processed.replace(/Copyright © \d+ The Bhaktivedanta Book Trust Int'l\. All Rights Reserved\./g, '');
    
    // Add spaces after sentences for better segmentation
    processed = processed.replace(/\./g, '. ');
    processed = processed.replace(/\.\s+/g, '. ');
    
    return processed;
  }

  /**
   * Get embedding for text with improved error handling and preprocessing
   * @param {string} text Text to embed
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async getEmbedding(text) {
    if (!text) {
      throw new Error('No text provided for embedding');
    }
    
    // Preprocess the text to improve embedding quality
    const processedText = this._preprocessText(text);
    
    // Generate a cache key - use a hash of the processed text
    const cacheKey = this._generateCacheKey(processedText);
    
    // Check cache first if enabled
    if (this.useCache && this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.cache.get(cacheKey);
    }
    
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
    }
    
    try {
      const embedding = await this._callOpenAIWithRetry(processedText);
      
      // Verify embedding dimensions
      if (!embedding || embedding.length === 0) {
        throw new Error('Embedding generation failed - empty embedding returned');
      }
      
      // Cache the result if caching is enabled
      if (this.useCache) {
        this.cache.set(cacheKey, embedding);
      }
      
      return embedding;
    } catch (error) {
      this.stats.errors++;
      
      logger.error(`Error generating OpenAI embedding: ${error.message}`);
      if (error.response) {
        logger.error(`OpenAI API error: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call OpenAI API with retry logic
   * @param {string} text Text to embed
   * @returns {Promise<Array<number>>} Embedding vector
   * @private
   */
  async _callOpenAIWithRetry(text) {
    let attempt = 0;
    let lastError = null;
    
    while (attempt < this.retryCount) {
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
        
        this.stats.apiCalls++;
        
        if (response.data.usage) {
          this.stats.totalTokens += response.data.usage.total_tokens;
        }
        
        // Log success once in a while
        if (this.stats.apiCalls % 20 === 0) {
          logger.info(`OpenAI embedding API stats: ${this.stats.apiCalls} calls, ${this.stats.totalTokens} tokens, ${this.stats.cacheHits} cache hits`);
        }
        
        return response.data.data[0].embedding;
      } catch (error) {
        lastError = error;
        attempt++;
        
        // Check if the error is retryable
        const isRetryable = this._isRetryableError(error);
        
        if (!isRetryable) {
          logger.error(`Non-retryable OpenAI API error: ${error.message}`);
          break;
        }
        
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        logger.warn(`Retryable error on OpenAI API call (attempt ${attempt}/${this.retryCount}): ${error.message}. Retrying in ${delay}ms.`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error('Failed to generate embedding after retries');
  }

  /**
   * Generate a cache key for text
   * @param {string} text Text to generate key for
   * @returns {string} Cache key
   * @private
   */
  _generateCacheKey(text) {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${hash}_${this.modelName}`;
  }

  /**
   * Check if an error is retryable
   * @param {Error} error Error to check
   * @returns {boolean} Whether the error is retryable
   * @private
   */
  _isRetryableError(error) {
    // Network errors are retryable
    if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // Rate limit errors are retryable
    if (error.response && error.response.status === 429) {
      return true;
    }
    
    // Server errors are retryable
    if (error.response && error.response.status >= 500 && error.response.status < 600) {
      return true;
    }
    
    return false;
  }

  /**
   * Get query embedding (alias method for compatibility)
   * @param {string} text Text to embed
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async get_query_embedding(text) {
    return this.getEmbedding(text);
  }

  /**
   * Generate embeddings for multiple texts with batching and retries
   * @param {Array<string>} texts Array of texts to embed
   * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
   */
  async getEmbeddings(texts) {
    if (!texts || texts.length === 0) {
      throw new Error('No texts provided for embedding');
    }
    
    // Preprocess all texts
    const processedTexts = texts.map(text => this._preprocessText(text));
    
    // For small batches, process individually to leverage cache
    if (texts.length <= this.batchSize) {
      return Promise.all(processedTexts.map(text => this.getEmbedding(text)));
    }
    
    // For larger sets, process in batches
    const results = [];
    for (let i = 0; i < processedTexts.length; i += this.batchSize) {
      const batch = processedTexts.slice(i, i + this.batchSize);
      
      try {
        // Try to batch request if possible
        const batchResults = await this._processBatch(batch);
        results.push(...batchResults);
        
        // Add a small delay between batches to avoid rate limits
        if (i + this.batchSize < processedTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        logger.error(`Error processing batch ${i / this.batchSize}: ${error.message}`);
        
        // Fall back to individual processing if batch fails
        const individualResults = await Promise.all(
          batch.map(async (text) => {
            try {
              return await this.getEmbedding(text);
            } catch (err) {
              logger.error(`Error embedding text: ${err.message}`);
              // Return a zero vector as fallback
              return new Array(this.dimensions).fill(0);
            }
          })
        );
        
        results.push(...individualResults);
      }
    }
    
    return results;
  }

  /**
   * Process a batch of texts
   * @param {Array<string>} batch Batch of texts to process
   * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
   * @private
   */
  async _processBatch(batch) {
    let attempt = 0;
    let lastError = null;
    
    while (attempt < this.retryCount) {
      try {
        // Check cache for each text in the batch
        const cacheResults = [];
        const uncachedTexts = [];
        const uncachedIndices = [];
        
        for (let i = 0; i < batch.length; i++) {
          const text = batch[i];
          const cacheKey = this._generateCacheKey(text);
          
          if (this.useCache && this.cache.has(cacheKey)) {
            cacheResults[i] = this.cache.get(cacheKey);
            this.stats.cacheHits++;
          } else {
            uncachedTexts.push(text);
            uncachedIndices.push(i);
          }
        }
        
        // If all results were cached, return them
        if (uncachedTexts.length === 0) {
          return cacheResults;
        }
        
        // Send batch request for uncached texts
        const response = await axios.post(
          'https://api.openai.com/v1/embeddings',
          {
            input: uncachedTexts,
            model: this.modelName
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        this.stats.apiCalls++;
        
        if (response.data.usage) {
          this.stats.totalTokens += response.data.usage.total_tokens;
        }
        
        // Process results
        const embeddings = response.data.data
          .sort((a, b) => a.index - b.index)
          .map(item => item.embedding);
        
        // Cache results
        if (this.useCache) {
          for (let i = 0; i < uncachedTexts.length; i++) {
            const text = uncachedTexts[i];
            const cacheKey = this._generateCacheKey(text);
            this.cache.set(cacheKey, embeddings[i]);
          }
        }
        
        // Combine cached and new results
        const results = [...cacheResults];
        for (let i = 0; i < uncachedIndices.length; i++) {
          results[uncachedIndices[i]] = embeddings[i];
        }
        
        return results;
      } catch (error) {
        lastError = error;
        attempt++;
        
        // Check if the error is retryable
        const isRetryable = this._isRetryableError(error);
        
        if (!isRetryable) {
          logger.error(`Non-retryable OpenAI API batch error: ${error.message}`);
          break;
        }
        
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        logger.warn(`Retryable error on OpenAI API batch call (attempt ${attempt}/${this.retryCount}): ${error.message}. Retrying in ${delay}ms.`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error('Failed to generate batch embeddings after retries');
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
      const cacheSize = this.cache.size;
      this.cache.clear();
      logger.info(`Embedding cache cleared (${cacheSize} entries)`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      enabled: this.useCache,
      size: this.cache.size,
      apiCalls: this.stats.apiCalls,
      cacheHits: this.stats.cacheHits,
      totalTokens: this.stats.totalTokens,
      hitRate: this.stats.apiCalls > 0 ? (this.stats.cacheHits / (this.stats.apiCalls + this.stats.cacheHits)) * 100 : 0,
      errors: this.stats.errors
    };
  }

  /**
   * Test the embedding service with a sample text
   * @param {string} sampleText Text to test (defaults to a Bhagavad Gita reference)
   * @returns {Promise<Object>} Test results
   */
  async testEmbedding(sampleText = "Bhagavad Gita teaches us about karma yoga and devotion to Krishna") {
    try {
      // Log the test request
      logger.info(`Testing embedding service with: "${sampleText.substring(0, 50)}${sampleText.length > 50 ? '...' : ''}"`);
      
      // Test preprocessing
      const preprocessed = this._preprocessText(sampleText);
      
      // Test embedding generation
      const startTime = Date.now();
      const embedding = await this.getEmbedding(sampleText);
      const duration = Date.now() - startTime;
      
      // Return results
      return {
        success: true,
        input: sampleText,
        preprocessed,
        dimensions: embedding.length,
        sample: embedding.slice(0, 5),
        duration: `${duration}ms`,
        cacheStats: this.getCacheStats()
      };
    } catch (error) {
      logger.error(`Embedding test failed: ${error.message}`);
      return {
        success: false,
        input: sampleText,
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Calculate embedding statistics for a dataset to assist with debugging
   * @param {Array<Object>} nodes Array of document nodes
   * @returns {Promise<Object>} Embedding statistics
   */
  async calculateEmbeddingStats(nodes) {
    if (!nodes || nodes.length === 0) {
      return { error: 'No nodes provided' };
    }
    
    try {
      logger.info(`Calculating embedding statistics for ${nodes.length} nodes...`);
      
      // Sample a subset of nodes for efficiency
      const sampleSize = Math.min(nodes.length, 10);
      const sampledNodes = [];
      
      // Sample nodes from beginning, middle, and end
      sampledNodes.push(nodes[0]); // First node
      sampledNodes.push(nodes[nodes.length - 1]); // Last node
      
      // Sample remaining nodes from the middle
      const step = Math.floor(nodes.length / (sampleSize - 2));
      for (let i = 1; i < sampleSize - 1; i++) {
        sampledNodes.push(nodes[i * step]);
      }
      
      // Calculate embeddings for sampled nodes
      const embeddings = await Promise.all(
        sampledNodes.map(node => this.getEmbedding(node.text))
      );
      
      // Calculate statistics
      const stats = {
        sampleSize,
        averageDimensions: 0,
        variance: 0,
        minMagnitude: Infinity,
        maxMagnitude: -Infinity,
        averageMagnitude: 0,
        similarityMatrix: []
      };
      
      // Calculate magnitudes
      const magnitudes = embeddings.map(embedding => {
        let sumSquared = 0;
        for (const value of embedding) {
          sumSquared += value * value;
        }
        const magnitude = Math.sqrt(sumSquared);
        
        stats.minMagnitude = Math.min(stats.minMagnitude, magnitude);
        stats.maxMagnitude = Math.max(stats.maxMagnitude, magnitude);
        
        return magnitude;
      });
      
      stats.averageMagnitude = magnitudes.reduce((sum, mag) => sum + mag, 0) / magnitudes.length;
      stats.averageDimensions = embeddings[0]?.length || 0;
      
      // Calculate similarity matrix
      for (let i = 0; i < embeddings.length; i++) {
        stats.similarityMatrix[i] = [];
        for (let j = 0; j < embeddings.length; j++) {
          if (i === j) {
            stats.similarityMatrix[i][j] = 1; // Identical
          } else {
            stats.similarityMatrix[i][j] = this._cosineSimilarity(embeddings[i], embeddings[j]);
          }
        }
      }
      
      // Add node text samples for reference
      stats.nodeSamples = sampledNodes.map((node, i) => ({
        id: node.id,
        textSample: node.text.substring(0, 100) + (node.text.length > 100 ? '...' : ''),
        length: node.text.length,
        magnitude: magnitudes[i],
        metadata: node.metadata
      }));
      
      return stats;
    } catch (error) {
      logger.error(`Error calculating embedding statistics: ${error.message}`);
      return { error: error.message };
    }
  }
}

module.exports = EmbeddingService;