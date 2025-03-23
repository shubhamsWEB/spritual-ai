/**
 * Controller for handling spiritual queries
 */
const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');
const RAGService = require('../services/ragService');

// Initialize the RAG service
const ragService = new RAGService();

/**
 * Process a query about the Bhagavad Gita
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const processQuery = async (req, res, next) => {
  try {
    const { question, language = 'en' } = req.body;
    
    // Validate input
    if (!question) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: {
          message: 'Question is required'
        }
      });
    }
    
    logger.info(`Processing query: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}" (language: ${language})`);
    
    // Process the query
    const result = await ragService.query(question, language);
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`Error processing query: ${error.message}`);
    next(error);
  }
};

/**
 * Get system health status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getSystemHealth = async (req, res, next) => {
  try {
    const health = await ragService.getSystemHealth();
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error(`Error getting system health: ${error.message}`);
    next(error);
  }
};

module.exports = {
  processQuery,
  getSystemHealth
};