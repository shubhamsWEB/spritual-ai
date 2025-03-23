/**
 * Middleware for request validation
 */
const { validationResult } = require('express-validator');
const { StatusCodes } = require('http-status-codes');

/**
 * Validates request using express-validator
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
const requestValidator = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // Format the validation errors
    const formattedErrors = errors.array().map(error => ({
      field: error.path,
      message: error.msg
    }));
    
    // Return validation error response
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: {
        message: 'Validation error',
        details: formattedErrors
      }
    });
  }
  
  // If no validation errors, proceed to the next middleware
  next();
};

module.exports = requestValidator;