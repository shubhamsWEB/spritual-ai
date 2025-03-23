/**
 * Central error handler for the application
 */
const { StatusCodes } = require('http-status-codes');
const logger = require('./logger');
const config = require('config');

// Get environment
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  
  // Log the error
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    statusCode,
  });

  // Structure the error response
  const errorResponse = {
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'SERVER_ERROR',
    },
  };

  // Include stack trace in development mode
  if (isDevelopment) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details || null;
  }

  // Send the error response
  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;