const express = require('express');
const fs = require('fs');
const path = require('path');
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');

const config = require('./src/config');
const logger = require('./src/utils/logger');
const ytdlp = require('./src/services/ytdlp');
const { helmetMiddleware, corsMiddleware, generalLimiter, downloadLimiter } = require('./src/middleware/security');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');

const infoRoutes = require('./src/routes/info');
const downloadRoutes = require('./src/routes/download');
const openFolderRoutes = require('./src/routes/openFolder');
const healthRoutes = require('./src/routes/health');

const app = express();

app.disable('x-powered-by');
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: '10kb' }));

// Ensure the downloads directory exists before anything tries to use it.
if (!fs.existsSync(config.downloadsDir)) {
  fs.mkdirSync(config.downloadsDir, { recursive: true });
}

const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath, { maxAge: config.isProd ? '1h' : 0 }));

app.use('/api', generalLimiter);
app.use('/api', healthRoutes);
app.use('/api', infoRoutes);
app.use('/api/download', downloadLimiter);
app.use('/api', downloadRoutes);
app.use('/api', openFolderRoutes);

// ============ EXTENSION DOWNLOAD - FIXED ============
app.get('/api/download-extension', (req, res) => {
  const zipPath = path.join(FRONTEND_PATH, 'Yeti_Extension.zip');
  
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: 'Extension ZIP file not found at: ' + zipPath });
  }

  res.download(zipPath, 'Yeti_Extension.zip', (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to send file' });
      }
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

const start = async () => {
  const version = await ytdlp.checkInstalled();
  if (!version) {
    logger.error(
      `yt-dlp was not found (looked for "${config.ytdlpPath}"). Install it and make sure it is on your PATH, ` +
        'or set YTDLP_PATH in your .env file. See https://github.com/yt-dlp/yt-dlp#installation'
    );
    process.exit(1);
  }
  app.locals.ytdlpVersion = version;
  logger.info(`yt-dlp ${version} detected`);

  app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
    logger.info(`Downloads directory: ${config.downloadsDir}`);
    logger.info(`Allowed origins: ${config.allowedOrigins.join(', ')}`);
  });
};

start();

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

module.exports = app;