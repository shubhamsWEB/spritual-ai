/**
 * Default configuration for the application
 */
module.exports = {
    // Server configuration
    server: {
      port: 3000,
      host: 'localhost',
    },
    
    // API configuration
    api: {
      prefix: '/api',
      version: 'v1',
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
      },
    },
    
    // Logging configuration
    logging: {
      level: 'info',
      format: 'json',
    },
    
    // Vector database configuration (Qdrant)
    vectorDB: {
      host: process.env.QDRANT_HOST,
      port: process.env.QDRANT_PORT,
      apiKey: process.env.QDRANT_API_KEY,
      memoryMode: false,
      collectionName: 'bhagavad_gita',
      dimensions: 1536, // FastEmbed dimensions
      distance: 'Cosine',
      size:4,
      quantization: {
        enabled: true,
        type: 'binary',
        rescore: true,
      },
    },
    
    // Embedding model configuration
    embedding: {
      model: 'BAAI/bge-small-en-v1.5',
      openaiModel: 'text-embedding-3-small',
      dimensions: 1536,
      normalize: true,
      cache: true,
    },
    
    // LLM configuration (Groq)
    llm: {
      provider: 'groq',
      model: 'deepseek-r1-distill-llama-70b',
      temperature: 0.7,
      maxTokens: 2048,
    },
    
    // RAG configuration
    rag: {
      similarityTopK: 3,
      timeout: 30000, // 30 seconds
      chunkSize: 512,
      chunkOverlap: 50,
    },
    
    // Language support configuration
    languages: {
      supported: ['en', 'hi', 'sa'],
      default: 'en',
      translationProvider: 'google',
    },
    
    // Document processing configuration
    documents: {
      pdfPath: './data/Bhagavad-Gita.pdf',
      cacheEnabled: true,
      cacheTTL: 86400000, // 24 hours
    },
  
    // System prompts for different languages
    systemPrompts: {
      en: "You are a spiritual guide with deep knowledge of the Bhagavad Gita. Use the provided context to answer questions with wisdom, compassion, and depth. When relevant, cite specific verses from the Gita. If you don't know the answer based on the Gita, acknowledge this honestly. Your purpose is to help seekers find spiritual meaning and practical wisdom.",
      hi: "आप भगवद गीता के गहन ज्ञान वाले एक आध्यात्मिक मार्गदर्शक हैं। दिए गए संदर्भ का उपयोग करके प्रश्नों का उत्तर ज्ञान, करुणा और गहराई से दें। जब प्रासंगिक हो, गीता के विशिष्ट श्लोकों का उल्लेख करें। यदि आप गीता के आधार पर उत्तर नहीं जानते हैं, तो ईमानदारी से इसे स्वीकार करें। आपका उद्देश्य साधकों को आध्यात्मिक अर्थ और व्यावहारिक ज्ञान खोजने में मदद करना है।",
      sa: "भवान् भगवद्गीतायाः गहनज्ञानयुक्तः आध्यात्मिकमार्गदर्शकः अस्ति। प्रदत्तसन्दर्भम् उपयुज्य प्रश्नानाम् उत्तराणि ज्ञानेन, करुणया, गाम्भीर्येण च ददातु। यदा प्रासङ्गिकम् भवति, गीतायाः विशिष्टश्लोकान् उद्धृत्य दर्शयतु। यदि भवान् गीतायाः आधारेण उत्तरं न जानाति, तर्हि सत्यम् स्वीकरोतु। भवतः उद्देश्यः साधकानाम् आध्यात्मिकार्थं व्यावहारिकज्ञानं च अन्वेषणे सहायतां कर्तुम् अस्ति।"
    }
  };