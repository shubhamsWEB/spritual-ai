/**
 * Server entry point for the Spiritual AI Bot
 */
const http = require('http');
const app = require('./app');
const logger = require('./utils/logger');
const config = require('config');

// Check for required environment variables
const requiredEnvVars = ['GROQ_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  logger.warn(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  logger.warn('Some functionality may be limited');
}

// If using external Qdrant and memoryMode is false
if (!config.get('vectorDB.memoryMode') && 
    (!process.env.QDRANT_HOST || !process.env.QDRANT_PORT)) {
  logger.warn('Qdrant connection details missing but memoryMode is false');
  logger.warn('Set memoryMode: true in config or provide QDRANT_HOST and QDRANT_PORT');
}

// Normalize port
const normalizePort = (val) => {
  const port = parseInt(val, 10);

  if (Number.isNaN(port)) {
    return val;
  }

  if (port >= 0) {
    return port;
  }

  return false;
};

// Get port from environment or config
const port = normalizePort(process.env.PORT || config.get('server.port') || 3000);
app.set('port', port);

// Create HTTP server
const server = http.createServer(app);

// Handle server errors
const onError = (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  // Handle specific errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      logger.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
};

// Event listener for server "listening" event
const onListening = () => {
  const addr = server.address();
  const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
  logger.info(`Server listening on ${bind}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
};

// Listen on provided port
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Received shutdown signal, shutting down gracefully...');
  
  server.close(() => {
    logger.info('Closed out remaining connections');
    process.exit(0);
  });

  // If after 10 seconds, force shutdown
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);