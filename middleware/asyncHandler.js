/**
 * Middleware for handling async route handlers
 * Eliminates the need for try/catch blocks in route handlers
 */

/**
 * Wraps an async function and catches any errors, passing them to next()
 * @param {Function} fn - The async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
  
  module.exports = asyncHandler;