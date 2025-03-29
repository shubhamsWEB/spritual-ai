/**
 * API routes index
 */
const express = require('express');
const queryRoutes = require('./queryRoutes');
const languageRoutes = require('./languageRoutes');
const authRoutes = require('./authRouts');

const router = express.Router();

// Apply route groups
router.use('/query', queryRoutes);
router.use('/language', languageRoutes);
router.use('/auth', authRoutes);

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
      '/api/language/format-gita-reference': 'Format a Gita reference in a specific language',
      '/api/auth/register': 'Register a new user',
      '/api/auth/login': 'Login a user',
      '/api/auth/logout': 'Logout a user',
      '/api/auth/me': 'Get current user profile',
      '/api/auth/reset-password': 'Request password reset',
      '/api/auth/profile': 'Update user profile'
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