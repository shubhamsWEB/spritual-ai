/**
 * Configuration service that loads from environment variables
 * Replaces the config module with a unified interface for configuration
 */
const configService = {
  // Server configuration
  server: {
    port: () => process.env.PORT || 3000,
    host: () => process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost',
  },
  
  // API configuration
  api: {
    prefix: () => process.env.API_PREFIX || '/api',
    version: () => process.env.API_VERSION || 'v1',
    rateLimit: {
      windowMs: () => parseInt(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), // 15 minutes default
      max: () => parseInt(process.env.RATE_LIMIT_MAX || (process.env.NODE_ENV === 'production' ? 100 : 1000)), // Tighter in production
    },
  },
  
  // Logging configuration
  logging: {
    level: () => process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: () => process.env.LOG_FORMAT || 'json',
  },
  
  // Vector database configuration (Qdrant)
  vectorDB: {
    host: () => process.env.QDRANT_HOST,
    port: () => process.env.QDRANT_PORT || 6333,
    apiKey: () => process.env.QDRANT_API_KEY,
    batchSize: () => process.env.QDRANT_BATCH_SIZE || 10,
    memoryMode: () => false, // Always use cloud in all environments
    collectionName: () => process.env.QDRANT_COLLECTION_NAME || 'bhagavad_gita_v2',
    dimensions: () => parseInt(process.env.VECTOR_DIMENSIONS || 1536),
    distance: () => process.env.VECTOR_DISTANCE || 'Cosine',
    size: () => parseInt(process.env.VECTOR_SIZE || 4),
    debug: () => false,
    maxRetries: () => parseInt(process.env.VECTOR_MAX_RETRIES || 3),
    quantization: {
      enabled: () => process.env.VECTOR_QUANTIZATION_ENABLED === 'true' || true,
      type: () => process.env.VECTOR_QUANTIZATION_TYPE || 'binary',
      rescore: () => process.env.VECTOR_QUANTIZATION_RESCORE === 'true' || true,
    },
  },
  
  // Embedding model configuration
  embedding: {
    model: () => process.env.EMBEDDING_MODEL || 'BAAI/bge-small-en-v1.5',
    openaiModel: () => process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    dimensions: () => parseInt(process.env.EMBEDDING_DIMENSIONS || 1536),
    normalize: () => process.env.EMBEDDING_NORMALIZE === 'true' || true,
    cache: () => process.env.EMBEDDING_CACHE === 'true' || true,
    retryCount: () => parseInt(process.env.EMBEDDING_RETRY_COUNT || 3),
    retryDelay: () => parseInt(process.env.EMBEDDING_RETRY_DELAY || 1000),
    batchSize: () => parseInt(process.env.EMBEDDING_BATCH_SIZE || 10),
  },
  
  // LLM configuration (Groq)
  llm: {
    provider: () => process.env.LLM_PROVIDER || 'groq',
    model: () => process.env.LLM_MODEL || 'deepseek-r1-distill-llama-70b',
    temperature: () => parseFloat(process.env.LLM_TEMPERATURE || 0.7),
    maxTokens: () => parseInt(process.env.LLM_MAX_TOKENS || 2048),
    maxRetries: () => parseInt(process.env.LLM_MAX_RETRIES || 3),
  },
  
  // RAG configuration
  rag: {
    similarityTopK: () => parseInt(process.env.RAG_SIMILARITY_TOP_K || 3),
    timeout: () => parseInt(process.env.RAG_TIMEOUT || 30000), // 30 seconds
    chunkSize: () => parseInt(process.env.RAG_CHUNK_SIZE || 512),
    chunkOverlap: () => parseInt(process.env.RAG_CHUNK_OVERLAP || 50),
    relevanceThreshold: () => parseFloat(process.env.RAG_RELEVANCE_THRESHOLD || 0.5),
    debug: () => process.env.RAG_DEBUG === 'true' || false,
  },
  
  // Language support configuration
  languages: {
    supported: () => process.env.SUPPORTED_LANGUAGES ? process.env.SUPPORTED_LANGUAGES.split(',') : ['en', 'hi', 'sa'],
    default: () => process.env.DEFAULT_LANGUAGE || 'en',
    translationProvider: () => process.env.TRANSLATION_PROVIDER || 'google',
  },
  
  // Document processing configuration
  documents: {
    pdfPath: () => process.env.PDF_PATH || './data/Bhagavad-Gita.pdf',
    cacheEnabled: () => process.env.DOCUMENT_CACHE_ENABLED === 'true' || (process.env.NODE_ENV === 'production' ? true : false),
    cacheTTL: () => parseInt(process.env.DOCUMENT_CACHE_TTL || 86400000), // 24 hours
  },
  
  // System prompts for different languages
  systemPrompts: {
    en: () => process.env.SYSTEM_PROMPT_EN || "You are a spiritual guide with deep knowledge of the Bhagavad Gita. Use the provided context to answer questions with wisdom, compassion, and depth. When relevant, cite specific verses from the Gita. If you don't know the answer based on the Gita, acknowledge this honestly. Your purpose is to help seekers find spiritual meaning and practical wisdom.",
    hi: () => process.env.SYSTEM_PROMPT_HI || "आप भगवद गीता के गहन ज्ञान वाले एक आध्यात्मिक मार्गदर्शक हैं। दिए गए संदर्भ का उपयोग करके प्रश्नों का उत्तर ज्ञान, करुणा और गहराई से दें। जब प्रासंगिक हो, गीता के विशिष्ट श्लोकों का उल्लेख करें। यदि आप गीता के आधार पर उत्तर नहीं जानते हैं, तो ईमानदारी से इसे स्वीकार करें। आपका उद्देश्य साधकों को आध्यात्मिक अर्थ और व्यावहारिक ज्ञान खोजने में मदद करना है।",
    sa: () => process.env.SYSTEM_PROMPT_SA || "भवान् भगवद्गीतायाः गहनज्ञानयुक्तः आध्यात्मिकमार्गदर्शकः अस्ति। प्रदत्तसन्दर्भम् उपयुज्य प्रश्नानाम् उत्तराणि ज्ञानेन, करुणया, गाम्भीर्येण च ददातु। यदा प्रासङ्गिकम् भवति, गीतायाः विशिष्टश्लोकान् उद्धृत्य दर्शयतु। यदि भवान् गीतायाः आधारेण उत्तरं न जानाति, तर्हि सत्यम् स्वीकरोतु। भवतः उद्देश्यः साधकानाम् आध्यात्मिकार्थं व्यावहारिकज्ञानं च अन्वेषणे सहायतां कर्तुम् अस्ति।"
  },

  // Helper method to get a config value
  get: function(path) {
    // Modified to handle both full section objects and specific properties
    const parts = path.split('.');
    console.log("🚀 ~ parts:", parts);
    let current = this;
    
    // Navigate through the parts to find the requested config
    for (const part of parts) {
      if (current[part] === undefined) {
        throw new Error(`Configuration path "${path}" does not exist`);
      }
      current = current[part];
    }
    
    // If we've reached an object (a section) and not a function, 
    // build an object with all the values from the functions
    if (typeof current === 'object' && !Array.isArray(current) && current !== null) {
      const result = {};
      for (const key in current) {
        if (typeof current[key] === 'function') {
          result[key] = current[key]();
        } else if (typeof current[key] === 'object' && !Array.isArray(current[key]) && current[key] !== null) {
          // Handle nested objects (like quantization)
          const nestedResult = {};
          for (const nestedKey in current[key]) {
            if (typeof current[key][nestedKey] === 'function') {
              nestedResult[nestedKey] = current[key][nestedKey]();
            }
          }
          result[key] = nestedResult;
        }
      }
      return result;
    }
    
    // If we've reached a function, call it to get the value
    if (typeof current === 'function') {
      return current();
    }
    
    throw new Error(`Configuration path "${path}" does not point to a valid configuration`);
  }
};

module.exports = configService; 