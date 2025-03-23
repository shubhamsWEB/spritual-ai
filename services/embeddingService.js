/**
 * Embedding service using FastEmbed with GTE-large model
 */
const { EmbeddingModel, FlagEmbedding } = require("fastembed");
const config = require('config');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const os = require('os');

class EmbeddingService {
    constructor() {
        this.modelConfig = {
            // Use the same model as your Python code
            model: "thenlper/gte-large",
            normalize: true,
            cache: true
        };
        this.model = null;
        this.cache = new Map();
        this.useCache = this.modelConfig.cache;
        this.initialized = false;
        this.initializationPromise = null;
        
        // Start initialization
        this.initializationPromise = this._initializeModel();
    }
    
    /**
     * Initialize the embedding model
     * @private
    */
   async _initializeModel() {
       try {
           console.log("🚀 ~ EmbeddingModel:", EmbeddingModel);
      // Create custom cache directory in the project
      const cacheDir = path.join(process.cwd(), 'model_cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      // Set environment variable for cache location
      process.env.HF_HOME = cacheDir;
      process.env.FASTEMBED_CACHE_PATH = cacheDir;
      
      logger.info(`Initializing embedding model: ${this.modelConfig.model}`);
      logger.info(`Using cache directory: ${cacheDir}`);
      
      // Initialize with GTE-large model (same as your Python code)
      this.model = await FlagEmbedding.init({
        modelName: this.modelConfig.model,
        showDownloadProgress: true,
        cacheDir: cacheDir
      });
      
      this.initialized = true;
      logger.info('FastEmbed model initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Error initializing embedding model: ${error.message}`);
      // Initialize fallback in case of failure
      this._initializeFallback();
      return false;
    }
  }

  /**
   * Initialize fallback embedding method
   * @private
   */
  _initializeFallback() {
    logger.info('Initializing fallback embedding method');
    this.useFallback = true;
    this.vocabulary = new Map();
    this.documentCount = 0;
    this.embeddingDimension = 768; // Standard embedding dimension
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
    
    try {
      // Wait for model to initialize if needed
      if (!this.initialized && !this.useFallback) {
        await this.initializationPromise;
      }
      
      let embedding;
      
      // Use FastEmbed if available, otherwise use fallback
      if (this.model && !this.useFallback) {
        const embeddings = await this.model.embed([text]);
        embedding = embeddings[0];
      } else {
        embedding = this._generateFallbackEmbedding(text);
      }
      
      // Cache the result if caching is enabled
      if (this.useCache) {
        this.cache.set(text, embedding);
      }
      
      return embedding;
    } catch (error) {
      logger.error(`Error generating embedding: ${error.message}`);
      
      // If FastEmbed fails, use fallback
      this.useFallback = true;
      return this._generateFallbackEmbedding(text);
    }
  }

  /**
   * Generate a fallback embedding when FastEmbed fails
   * @param {string} text Text to embed
   * @returns {Array<number>} Embedding vector
   * @private
   */
  _generateFallbackEmbedding(text) {
    logger.info('Using fallback embedding method');
    
    // Tokenize the text
    const tokens = this._tokenize(text);
    
    // Update vocabulary for TF-IDF
    this._updateVocabulary(tokens);
    
    // Create embedding vector
    const embedding = this._createFallbackEmbedding(tokens);
    
    return embedding;
  }

  /**
   * Tokenize text for fallback embedding
   * @param {string} text Text to tokenize
   * @returns {Array<string>} Array of tokens
   * @private
   */
  _tokenize(text) {
    // Convert to lowercase
    const lowerText = text.toLowerCase();
    
    // Remove special characters but keep spaces and some punctuation
    const cleanedText = lowerText.replace(/[^\w\s.,?!]/g, ' ');
    
    // Split by whitespace and filter empty tokens
    const tokens = cleanedText.split(/\s+/).filter(token => token.length > 0);
    
    // Add bigrams (pairs of adjacent words) for better semantic capture
    const bigrams = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
    }
    
    return [...tokens, ...bigrams];
  }

  /**
   * Update vocabulary for TF-IDF calculation
   * @param {Array<string>} tokens Tokens to add to vocabulary
   * @private
   */
  _updateVocabulary(tokens) {
    // Count unique tokens in this document
    const uniqueTokens = new Set(tokens);
    
    // Update document frequencies
    for (const token of uniqueTokens) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, 1);
      } else {
        this.vocabulary.set(token, this.vocabulary.get(token) + 1);
      }
    }
    
    this.documentCount++;
  }

  /**
   * Create fallback embedding vector
   * @param {Array<string>} tokens Tokens to embed
   * @returns {Array<number>} Embedding vector
   * @private
   */
  _createFallbackEmbedding(tokens) {
    // Initialize embedding vector with zeros
    const embedding = new Array(this.embeddingDimension).fill(0);
    
    // Count token frequencies in this document
    const tokenFrequencies = new Map();
    for (const token of tokens) {
      if (!tokenFrequencies.has(token)) {
        tokenFrequencies.set(token, 1);
      } else {
        tokenFrequencies.set(token, tokenFrequencies.get(token) + 1);
      }
    }
    
    // Calculate TF-IDF for each token and add to embedding
    for (const [token, frequency] of tokenFrequencies.entries()) {
      // Term frequency
      const tf = frequency / tokens.length;
      
      // Document frequency
      const df = this.vocabulary.get(token) || 1;
      
      // Inverse document frequency
      const idf = Math.log((this.documentCount + 1) / df);
      
      // TF-IDF weight
      const weight = tf * idf;
      
      // Deterministic position in the embedding vector using hash
      const positions = this._getHashPositions(token, 3); // Get 3 positions for each token
      
      // Add the weighted value to those positions
      for (const position of positions) {
        embedding[position] += weight;
      }
    }
    
    // Normalize the embedding vector to unit length
    return this._normalizeVector(embedding);
  }

  /**
   * Get hash positions for tokens
   * @param {string} token Token to hash
   * @param {number} count Number of positions to generate
   * @returns {Array<number>} Array of position indices
   * @private
   */
  _getHashPositions(token, count) {
    const positions = [];
    let hash = 0;
    
    // Simple string hash function
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash |= 0; // Convert to 32-bit integer
    }
    
    // Generate multiple positions from the hash
    const posBase = Math.abs(hash) % this.embeddingDimension;
    
    for (let i = 0; i < count; i++) {
      positions.push((posBase + i * 97) % this.embeddingDimension); // Use prime number for better distribution
    }
    
    return positions;
  }

  /**
   * Normalize vector to unit length
   * @param {Array<number>} vector Vector to normalize
   * @returns {Array<number>} Normalized vector
   * @private
   */
  _normalizeVector(vector) {
    // Calculate magnitude (length) of the vector
    const squaredSum = vector.reduce((sum, value) => sum + value * value, 0);
    const magnitude = Math.sqrt(squaredSum);
    
    // Prevent division by zero
    if (magnitude === 0) {
      return vector;
    }
    
    // Normalize each component
    return vector.map(value => value / magnitude);
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
    
    return Promise.all(texts.map(text => this.getEmbedding(text)));
  }

  /**
   * Calculate similarity between two texts
   * @param {string} text1 First text
   * @param {string} text2 Second text
   * @returns {Promise<number>} Similarity score (cosine similarity)
   */
  async calculateSimilarity(text1, text2) {
    const embedding1 = await this.getEmbedding(text1);
    const embedding2 = await this.getEmbedding(text2);
    
    return this._cosineSimilarity(embedding1, embedding2);
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