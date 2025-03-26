/**
 * Logger utility for the application
 */
const { createLogger, format, transports } = require('winston');
const config = require('config');

// Define log format
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// Get logging level with safer fallback
let loggingLevel = 'info'; // Default fallback
try {
  loggingLevel = config.get('logging.level');
} catch (error) {
  console.warn('Logging level not defined in config, using default: info');
}

// Create console format with colors for better readability
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length 
      ? `\n${JSON.stringify(meta, null, 2)}` 
      : '';
    return `${timestamp} ${level}: ${message}${metaString}`;
  })
);

// Determine if running in production or Vercel
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

// Configure transports
const loggerTransports = [
  // Always write logs to the console
  new transports.Console({
    format: consoleFormat
  })
];

// Only add file transports when not in production and not on Vercel
if (!isProduction && !isVercel) {
  loggerTransports.push(
    new transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new transports.File({ 
      filename: 'logs/combined.log' 
    })
  );
}

// Create the logger
const logger = createLogger({
  level: loggingLevel,
  format: logFormat,
  defaultMeta: { service: 'spiritual-bot' },
  transports: loggerTransports,
  // Exit on error
  exitOnError: false
});

// Create a stream object for Morgan
logger.stream = {
  write: (message) => logger.http(message.trim())
};

// Add a simplified shutdown function that doesn't depend on file transports
logger.shutdown = () => {
  logger.info('Shutting down logger...');
  
  return Promise.resolve();
};

module.exports = logger;