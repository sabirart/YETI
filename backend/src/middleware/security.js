const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../utils/logger');

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://img.youtube.com', 'https://i.ytimg.com'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow same-origin/non-browser requests (no Origin header) and
    // anything explicitly whitelisted via ALLOWED_ORIGINS.
    if (!origin || config.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    logger.warn(`Blocked CORS request from origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  maxAge: 600,
});

const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxGeneral,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

const downloadLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxDownload,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many download requests, please slow down.' },
});

module.exports = { helmetMiddleware, corsMiddleware, generalLimiter, downloadLimiter };
