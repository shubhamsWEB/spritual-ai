/**
 * Vercel production environment configuration
 */
module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    host: '0.0.0.0', // Allow connections from all sources
  },
  
  // API configuration
  api: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Tighter rate limiting in production
    },
  },
  
  // Logging configuration
  logging: {
    level: 'info', // Less verbose in production
  },
  
  // Vector database configuration (Qdrant)
  vectorDB: {
    host: process.env.QDRANT_HOST || 'qdrant',
    port: process.env.QDRANT_PORT || 6333,
    memoryMode: false,
    apiKey: process.env.QDRANT_API_KEY,
  },
  
  // LLM configuration
  llm: {
    temperature: 0.7,
  },
  
  // Document processing
  documents: {
    cacheEnabled: true,
  }
}; 