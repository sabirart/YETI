const express = require('express');
const router = express.Router();

const ytdlp = require('../services/ytdlp');
const config = require('../config');
const logger = require('../utils/logger');
const { isValidVideoId, isValidQuality, buildWatchUrl, buildFormatSelector, sanitizeFilename, isValidUrl } = require('../utils/validate');

let activeJobs = 0;

router.get('/download/:videoId/:quality', async (req, res) => {
  const { videoId, quality } = req.params;

  // Check if it's a YouTube video ID or a full URL
  let videoUrl = videoId;
  if (!videoId.startsWith('http://') && !videoId.startsWith('https://')) {
    // If not a URL, treat as YouTube video ID
    if (!isValidVideoId(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID or URL' });
    }
    videoUrl = buildWatchUrl(videoId);
  } else {
    // It's a full URL, validate it
    if (!isValidUrl(videoId)) {
      return res.status(400).json({ error: 'Invalid video URL' });
    }
    videoUrl = videoId;
  }
  
  if (!isValidQuality(quality)) {
    return res.status(400).json({ error: 'Invalid quality selection' });
  }

  if (activeJobs >= config.maxConcurrentJobs) {
    return res.status(429).json({ error: 'Server is busy, please try again shortly' });
  }

  const url = videoUrl;
  const isAudio = quality === 'audio';
  const formatSelector = buildFormatSelector(quality);

  activeJobs += 1;
  let job = null;

  try {
    // Get video info for title
    let title = `video_${videoId}`;
    try {
      const info = await ytdlp.getVideoInfo(url);
      if (info?.title) title = info.title;
    } catch (err) {
      logger.warn(`Could not fetch title for ${videoId}, using fallback name:`, err.message);
    }

    const cleanTitle = sanitizeFilename(title);
    const qualityLabel = isAudio ? 'audio' : `${quality}p`;
    const extension = isAudio ? 'mp3' : 'mp4';
    const filename = `${cleanTitle}_${qualityLabel}.${extension}`;

    // Best-effort expected size
    const approxBytes = await ytdlp.getApproxFileSize(url, formatSelector);

    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (approxBytes) res.setHeader('X-File-Size-Estimate', String(approxBytes));
    res.setHeader('Cache-Control', 'no-store');

    job = ytdlp.streamDownload({
      url,
      formatSelector,
      isAudio,
      onProgress: (p) => {
        logger.debug(`[${videoId}] ${p.percent}% eta=${p.eta} speed=${p.speed}`);
      },
    });

    req.on('close', () => {
      if (job && !res.writableEnded) {
        job.process.kill('SIGKILL');
      }
    });

    job.stdout.pipe(res);

    job.done.catch((err) => {
      logger.error(`Download stream failed for ${videoId}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Download failed', details: err.message });
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    res.on('close', () => {
      activeJobs = Math.max(0, activeJobs - 1);
    });
  } catch (error) {
    activeJobs = Math.max(0, activeJobs - 1);
    logger.error('Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed', details: error.message });
    }
  }
});

module.exports = router;