/**
 * Routes for spiritual queries
 */
const express = require('express');
const { body, query } = require('express-validator');
const rateLimit = require('express-rate-limit');
const configService = require('../utils/configService');
const queryController = require('../controllers/queryController');
const requestValidator = require('../middleware/requestValidator');
const verifySupabaseAuth = require('../middleware/verifySupabaseAuth');

const router = express.Router();

// Rate limiting configuration
const apiConfig = configService.get('api.rateLimit');
const limiter = rateLimit({
  windowMs: apiConfig.windowMs,
  max: apiConfig.max,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later'
    }
  }
});

// Apply rate limiter to all routes
router.use(limiter);

/**
 * @route POST /api/query
 * @description Process a spiritual query
 * @access Private - requires authentication
 */
router.post(
  '/',
  verifySupabaseAuth, // Use Supabase authentication middleware to protect this route
  [
    body('question')
      .notEmpty()
      .withMessage('Question is required')
      .isString()
      .withMessage('Question must be a string')
      .isLength({ min: 2, max: 500 })
      .withMessage('Question must be between 2 and 500 characters'),
    
    body('language')
      .optional()
      .isString()
      .withMessage('Language must be a string')
      .isLength({ min: 2, max: 5 })
      .withMessage('Language code must be between 2 and 5 characters'),
    
    requestValidator
  ],
  queryController.processQuery
);

/**
 * @route GET /api/query/health
 * @description Get system health status
 * @access Public
 */
router.get('/health', queryController.getSystemHealth);

/**
 * @route GET /api/query/history
 * @description Get user query history
 * @access Private - requires authentication
 */
router.get(
  '/history',
  verifySupabaseAuth,
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    
    requestValidator
  ],
  queryController.getUserQueryHistory
);

/**
 * @route DELETE /api/query/history/:recordId
 * @description Delete a query history record
 * @access Private - requires authentication
 */
router.delete(
  '/history/:recordId',
  verifySupabaseAuth,
  queryController.deleteQueryHistory
);

/**
 * @route DELETE /api/query/history
 * @description Clear all query history
 * @access Private - requires authentication
 */
router.delete(
  '/history',
  verifySupabaseAuth,
  queryController.clearQueryHistory
);

module.exports = router;