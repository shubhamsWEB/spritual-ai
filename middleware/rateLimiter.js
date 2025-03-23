/**
 * Rate limiting middleware
 */
const rateLimit = require('express-rate-limit');
const { StatusCodes } = require('http-status-codes');
const config = require('config');

// Get rate limit configuration
const apiConfig = config.get('api.rateLimit');

/**
 * Creates a rate limiter middleware
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware function
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: apiConfig.windowMs, // Default window: 15 minutes
    max: apiConfig.max, // Default limit: 100 requests per window
    standardHeaders: true, // Return rate limit info in the headers
    legacyHeaders: false, // Disable the X-RateLimit headers
    message: {
      success: false,
      error: {
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    },
    statusCode: StatusCodes.TOO_MANY_REQUESTS
  };
  
  // Merge default options with provided options
  const limiterOptions = { ...defaultOptions, ...options };
  
  // Create and return the rate limiter
  return rateLimit(limiterOptions);
};

// Create default rate limiter
const defaultRateLimiter = createRateLimiter();

module.exports = {
  createRateLimiter,
  defaultRateLimiter
};