/**
 * Authentication middleware
 */
const { StatusCodes } = require('http-status-codes');
const jwt = require('jsonwebtoken');
const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');

/**
 * Verify JWT token middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header or cookie
    let token = null;
    
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // If no token in header, check cookie
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // If no token found, return unauthorized
    if (!token) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }

    // Verify token with Supabase
    const userData = await supabaseService.verifyToken(token);

    if (!userData || !userData.user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        }
      });
    }

    // Attach user to request
    req.user = userData.user;
    
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      error: {
        message: 'Authentication failed',
        code: 'AUTH_FAILED'
      }
    });
  }
};

/**
 * Optional authentication middleware - doesn't require auth but attaches user if present
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    // Get token from header or cookie
    let token = null;
    
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // If no token in header, check cookie
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // If no token found, continue without user
    if (!token) {
      return next();
    }

    // Verify token with Supabase
    try {
      const userData = await supabaseService.verifyToken(token);
      
      if (userData && userData.user) {
        // Attach user to request
        req.user = userData.user;
      }
    } catch (tokenError) {
      // Continue without user if token is invalid
      logger.warn(`Invalid token: ${tokenError.message}`);
    }
    
    next();
  } catch (error) {
    // Continue without user
    logger.error(`Optional authentication error: ${error.message}`);
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuthenticate
};