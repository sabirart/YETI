const logger = require('../utils/logger');

// 404 handler for unmatched API routes
const notFound = (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
};

// Last-resort error handler. Never leaks stack traces or internal details
// to the client in production.
const errorHandler = (err, req, res, next) => {
  logger.error(`${req.method} ${req.path} ->`, err.message);

  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  if (res.headersSent) {
    // Response (likely a stream) already started; just end it.
    res.end();
    return;
  }

  res.status(err.status || 500).json({
    error: 'Something went wrong',
    ...(process.env.NODE_ENV !== 'production' ? { details: err.message } : {}),
  });
};

module.exports = { notFound, errorHandler };
