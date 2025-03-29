/**
 * Controller for authentication operations
 */
const { StatusCodes } = require('http-status-codes');
const jwt = require('jsonwebtoken');
const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');

// Cookie options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: {
          message: 'Email and password are required',
          code: 'MISSING_REQUIRED_FIELDS'
        }
      });
    }

    // Register user with Supabase
    const userData = await supabaseService.signUp(email, password, { name });
    
    // Check if email confirmation is required
    if (!userData.user || userData.user.confirmed_at === null) {
      return res.status(StatusCodes.OK).json({
        success: true,
        data: {
          message: 'Registration successful. Please check your email to confirm your account.',
          confirmed: false
        }
      });
    }

    // Create a session token
    const token = userData.session.access_token;
    
    // Set cookie
    res.cookie('token', token, cookieOptions);

    // Return success response
    return res.status(StatusCodes.CREATED).json({
      success: true,
      data: {
        user: {
          id: userData.user.id,
          email: userData.user.email,
          name: userData.user.user_metadata?.name || '',
          createdAt: userData.user.created_at
        },
        token
      }
    });
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    
    // Handle specific Supabase errors
    if (error.message.includes('User already registered')) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        error: {
          message: 'Email already registered',
          code: 'EMAIL_EXISTS'
        }
      });
    }
    
    next(error);
  }
};

/**
 * Login a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: {
          message: 'Email and password are required',
          code: 'MISSING_REQUIRED_FIELDS'
        }
      });
    }

    // Sign in user with Supabase
    const userData = await supabaseService.signIn(email, password);

    // Create a session token
    const token = userData.session.access_token;
    
    // Set cookie
    res.cookie('token', token, cookieOptions);

    // Return success response
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        user: {
          id: userData.user.id,
          email: userData.user.email,
          name: userData.user.user_metadata?.name || '',
          createdAt: userData.user.created_at
        },
        token
      }
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    
    // Handle invalid credentials
    if (error.message.includes('Invalid login credentials')) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        }
      });
    }
    
    next(error);
  }
};

/**
 * Logout a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const logout = async (req, res, next) => {
  try {
    // Get token
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

    // Sign out with Supabase if token exists
    if (token) {
      await supabaseService.signOut(token);
    }

    // Clear cookie
    res.clearCookie('token');

    // Return success response
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        message: 'Logged out successfully'
      }
    });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    next(error);
  }
};

/**
 * Get current user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getCurrentUser = async (req, res, next) => {
  try {
    // User should be attached to request by authenticate middleware
    if (!req.user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }

    // Return user data
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.user_metadata?.name || '',
          createdAt: req.user.created_at
        }
      }
    });
  } catch (error) {
    logger.error(`Get current user error: ${error.message}`);
    next(error);
  }
};

/**
 * Request password reset
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    // Validate input
    if (!email) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: {
          message: 'Email is required',
          code: 'MISSING_EMAIL'
        }
      });
    }

    // Send password reset email
    await supabaseService.resetPassword(email);

    // Return success response (always return success to prevent email enumeration)
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        message: 'If your email is registered, you will receive a password reset link'
      }
    });
  } catch (error) {
    logger.error(`Password reset request error: ${error.message}`);
    
    // Still return success to prevent email enumeration
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        message: 'If your email is registered, you will receive a password reset link'
      }
    });
  }
};

/**
 * Update user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const updateProfile = async (req, res, next) => {
  try {
    // User should be attached to request by authenticate middleware
    if (!req.user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }
      });
    }

    const { name } = req.body;
    
    // Update user metadata
    const updatedUser = await supabaseService.updateUserMetadata(req.user.id, {
      ...req.user.user_metadata,
      name
    });

    // Return updated user data
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.user_metadata?.name || '',
          createdAt: updatedUser.created_at
        }
      }
    });
  } catch (error) {
    logger.error(`Update profile error: ${error.message}`);
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
  requestPasswordReset,
  updateProfile
};