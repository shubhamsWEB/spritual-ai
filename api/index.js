require('dotenv').config();

// Add these lines for Vercel environment
// Set default config values before requiring the app
if (process.env.VERCEL) {
  process.env.NODE_CONFIG = JSON.stringify({
    logging: { level: 'info' },
    server: { port: process.env.PORT || 3000 },
    api: { 
      rateLimit: { 
        windowMs: 15 * 60 * 1000, 
        max: 100 
      } 
    },
    // Include other necessary config values here
  });
}

const app = require('../app');

// Don't listen to a port in production with Vercel
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${port}`);
  });
}

// Export a serverless handler for Vercel
module.exports = app;
