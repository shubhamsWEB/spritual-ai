/**
 * Supabase authentication verification middleware
 * This verifies Supabase JWT tokens
 */
const { StatusCodes } = require('http-status-codes');
const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');

/**
 * Verify Supabase JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const verifySupabaseAuth = async (req, res, next) => {
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

    // Verify the token with Supabase
    try {
      const { user } = await supabaseService.verifyToken(token);
      
      if (!user) {
        throw new Error('Invalid token');
      }
      
      // Set the user in the request
      req.user = user;
      
      next();
    } catch (error) {
      logger.error(`Token verification error: ${error.message}`);
      
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        }
      });
    }
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

module.exports = verifySupabaseAuth;