/**
 * Development environment configuration
 */
module.exports = {
    // Server configuration
    server: {
      port: 3000,
    },
    
    // API configuration
    api: {
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000, // Higher limit for development
      },
    },
    
    // Logging configuration
    logging: {
      level: 'debug', // More verbose logging in development
    },
    
    // Vector database configuration (Qdrant)
    vectorDB: {
      memoryMode: true, // In-memory mode for development
    },
    
    // LLM configuration
    llm: {
      temperature: 0.8, // Slightly higher temperature for development
    },
    
    // Document processing
    documents: {
      cacheEnabled: false, // Disable cache in development
    }
  };