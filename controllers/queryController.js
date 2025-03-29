/**
 * Controller for handling spiritual queries with query history
 */
const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');
const RAGService = require('../services/ragService');
const supabaseService = require('../services/supabaseService');

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
    
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }
    
    logger.info(`Processing query from user ${req.user.id}: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}" (language: ${language})`);
    
    // Process the query
    const result = await ragService.query(question, language);
    
    // Save query history to Supabase
    try {
      await supabaseService.saveQueryHistory(
        req.user.id,
        question,
        result.answer,
        language
      );
      logger.info(`Saved query history for user ${req.user.id}`);
    } catch (historyError) {
      // Don't fail the request if saving history fails
      logger.error(`Error saving query history: ${historyError.message}`);
    }
    
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

/**
 * Get user query history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getUserQueryHistory = async (req, res, next) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }
    
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
    
    // Get query history from Supabase
    const queryHistory = await supabaseService.getUserQueryHistory(req.user.id, limit);
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        query_history: queryHistory
      }
    });
  } catch (error) {
    logger.error(`Error getting user query history: ${error.message}`);
    next(error);
  }
};

/**
 * Delete a query history record
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const deleteQueryHistory = async (req, res, next) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }
    
    const { recordId } = req.params;
    
    if (!recordId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: {
          message: 'Record ID is required'
        }
      });
    }
    
    // Delete the record
    await supabaseService.deleteQueryHistory(req.user.id, recordId);
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        message: 'Query history record deleted successfully'
      }
    });
  } catch (error) {
    logger.error(`Error deleting query history: ${error.message}`);
    next(error);
  }
};

/**
 * Clear all query history for the user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const clearQueryHistory = async (req, res, next) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }
    
    // Clear all history for the user
    await supabaseService.clearQueryHistory(req.user.id);
    
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        message: 'Query history cleared successfully'
      }
    });
  } catch (error) {
    logger.error(`Error clearing query history: ${error.message}`);
    next(error);
  }
};

module.exports = {
  processQuery,
  getSystemHealth,
  getUserQueryHistory,
  deleteQueryHistory,
  clearQueryHistory
};