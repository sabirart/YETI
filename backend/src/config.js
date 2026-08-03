require('dotenv').config();
const os = require('os');
const path = require('path');

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const ALLOWED_QUALITIES = ['144', '240', '360', '480', '720', '1080', '1440', '2160', 'audio'];

const config = {
  port: toInt(process.env.PORT, 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',

  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  downloadsDir:
    process.env.DOWNLOADS_DIR || path.join(os.homedir(), 'Downloads', 'yeti'),

  ytdlpPath: process.env.YTDLP_PATH || './yt-dlp',

  maxConcurrentJobs: toInt(process.env.MAX_CONCURRENT_JOBS, 5),

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    maxGeneral: toInt(process.env.RATE_LIMIT_MAX_GENERAL, 60),
    maxDownload: toInt(process.env.RATE_LIMIT_MAX_DOWNLOAD, 30),
  },

  logLevel: process.env.LOG_LEVEL || 'info',

  allowedQualities: ALLOWED_QUALITIES,
};

module.exports = config;
