/**
 * API routes index
 */
const express = require('express');
const queryRoutes = require('./queryRoutes');
const languageRoutes = require('./languageRoutes');

const router = express.Router();

// Apply route groups
router.use('/query', queryRoutes);
router.use('/language', languageRoutes);

// API information endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'Spiritual AI Bot API',
    version: '1.0.0',
    description: 'A multilingual spiritual AI bot based on the Bhagavad Gita',
    endpoints: {
      '/api/query': 'Process a spiritual query',
      '/api/query/health': 'Get system health status',
      '/api/language': 'Get supported languages',
      '/api/language/detect': 'Detect the language of text',
      '/api/language/translate': 'Translate text',
      '/api/language/format-gita-reference': 'Format a Gita reference in a specific language'
    }
  });
});
// Add a system health endpoint
router.get('/system/health', async (req, res) => {
  try {
    const ragService = new RAGService();
    await ragService.initialize();
    const health = await ragService.getSystemHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;