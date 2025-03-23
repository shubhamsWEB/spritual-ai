/**
 * Improved embedding service with better embedding quality
 */
const crypto = require('crypto');
const config = require('config');
const logger = require('../utils/logger');

class EmbeddingService {
  constructor() {
    this.cache = new Map();
    this.useCache = true; // Enable caching by default
    this.vocabulary = new Map();
    this.documentCount = 0;
    this.embeddingDimension = 768; // Standard embedding size
    
    // Define common spiritual terms with their synonyms for better semantic mapping
    this.conceptMappings = {
      'karma': ['action', 'deed', 'work', 'consequence', 'causality', 'fate'],
      'dharma': ['duty', 'righteousness', 'virtue', 'morality', 'law', 'teaching'],
      'bhakti': ['devotion', 'worship', 'love', 'dedication', 'faith'],
      'yoga': ['union', 'discipline', 'practice', 'meditation', 'path'],
      'moksha': ['liberation', 'freedom', 'release', 'enlightenment', 'salvation'],
      'atman': ['soul', 'self', 'spirit', 'essence', 'consciousness'],
      'brahman': ['absolute', 'ultimate', 'divine', 'supreme', 'godhead'],
      'maya': ['illusion', 'delusion', 'appearance', 'manifestation'],
      'guna': ['quality', 'property', 'attribute', 'nature', 'tendency'],
      'arjuna': ['warrior', 'disciple', 'student', 'seeker'],
      'krishna': ['divine', 'god', 'teacher', 'guide', 'supreme'],
      'gita': ['scripture', 'text', 'teaching', 'wisdom', 'discourse'],
    };
    
    logger.info('Initialized improved embedding service');
  }

  /**
   * Generate embedding for text
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
      // Expand text with spiritual concept mappings
      const expandedText = this._expandWithConcepts(text);
      
      // Tokenize the text
      const tokens = this._tokenize(expandedText);
      
      // Update vocabulary
      this._updateVocabulary(tokens);
      
      // Create embedding vector
      const embedding = this._createEmbedding(tokens);
      
      // Cache the result if caching is enabled
      if (this.useCache) {
        this.cache.set(text, embedding);
      }
      
      return embedding;
    } catch (error) {
      logger.error(`Error generating embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Expand text with spiritual concept mappings to improve semantic understanding
   * @param {string} text Text to expand
   * @returns {string} Expanded text
   * @private
   */
  _expandWithConcepts(text) {
    let expandedText = text;
    
    // Find spiritual concepts in the text and add their synonyms
    Object.entries(this.conceptMappings).forEach(([concept, synonyms]) => {
      const conceptRegex = new RegExp(`\\b${concept}\\b`, 'i');
      if (conceptRegex.test(text)) {
        // Add a subset of synonyms to avoid too much expansion
        const selectedSynonyms = synonyms.slice(0, 3).join(' ');
        expandedText += ` ${selectedSynonyms}`;
      }
    });
    
    return expandedText;
  }

  /**
   * Tokenize text into words and phrases with more advanced processing
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
    const words = cleanedText.split(/\s+/).filter(token => token.length > 0);
    
    // Create trigrams and bigrams for better phrase detection
    const tokens = [...words];
    
    // Add bigrams (pairs of adjacent words)
    for (let i = 0; i < words.length - 1; i++) {
      tokens.push(`${words[i]}_${words[i + 1]}`);
    }
    
    // Add trigrams (triplets of adjacent words)
    for (let i = 0; i < words.length - 2; i++) {
      tokens.push(`${words[i]}_${words[i + 1]}_${words[i + 2]}`);
    }
    
    return tokens;
  }

  /**
   * Update vocabulary with new tokens
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
   * Create embedding vector with improved semantic mapping
   * @param {Array<string>} tokens Tokens to embed
   * @returns {Array<number>} Embedding vector
   * @private
   */
  _createEmbedding(tokens) {
    // Initialize embedding vector with small random values for better differentiation
    const embedding = Array.from({ length: this.embeddingDimension }, 
      () => (Math.random() - 0.5) * 0.01); // Small random initialization
    
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
      
      // Inverse document frequency with smoothing
      const idf = Math.log((this.documentCount + 1) / (df + 0.5));
      
      // TF-IDF weight
      const weight = tf * idf;
      
      // Get multiple positions in the embedding vector
      const positions = this._getPositionsForToken(token);
      
      // Add the weighted value to those positions
      for (const position of positions) {
        embedding[position] += weight;
      }
    }
    
    // Normalize the embedding vector to unit length
    return this._normalizeVector(embedding);
  }

  /**
   * Get consistent positions for a token using a hash function
   * @param {string} token Token to hash
   * @returns {Array<number>} Array of position indices
   * @private
   */
  _getPositionsForToken(token) {
    // Use SHA-256 for better hash distribution
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    
    // Use multiple segments of the hash to create different positions
    const numPositions = Math.max(3, Math.min(20, token.length)); // Scale with token length
    const positions = [];
    
    for (let i = 0; i < numPositions; i++) {
      // Use different segments of the hash for each position
      const segment = hash.substring(i * 2, (i + 2) * 2);
      // Convert hex segment to integer and get modulo of dimension
      const position = parseInt(segment, 16) % this.embeddingDimension;
      positions.push(position);
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
      // If the vector is all zeros, return a random unit vector
      const randomVector = Array.from(
        { length: vector.length }, 
        () => Math.random() - 0.5
      );
      return this._normalizeVector(randomVector);
    }
    
    // Normalize each component
    return vector.map(value => value / magnitude);
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
    
    try {
      return await Promise.all(texts.map(text => this.getEmbedding(text)));
    } catch (error) {
      logger.error(`Error generating multiple embeddings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get query embedding (for compatibility with Python code)
   * @param {string} text Text to embed
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async get_query_embedding(text) {
    return this.getEmbedding(text);
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