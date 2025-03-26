require('dotenv').config();
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
