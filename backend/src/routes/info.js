const express = require('express');
const router = express.Router();

const ytdlp = require('../services/ytdlp');
const TtlCache = require('../utils/ttlCache');
const { isValidVideoId, isValidQuality, buildWatchUrl, buildFormatSelector, isValidUrl } = require('../utils/validate');
const logger = require('../utils/logger');

const infoCache = new TtlCache(5 * 60 * 1000, 300);

const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return null;
  if (bytes > 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB';
  if (bytes > 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
};

router.get('/info/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const quality = req.query.quality || '720';

  // Check if it's a YouTube video ID or a full URL
  let videoUrl = videoId;
  if (!videoId.startsWith('http://') && !videoId.startsWith('https://')) {
    if (!isValidVideoId(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID or URL' });
    }
    videoUrl = buildWatchUrl(videoId);
  } else {
    if (!isValidUrl(videoId)) {
      return res.status(400).json({ error: 'Invalid video URL' });
    }
    videoUrl = videoId;
  }
  
  if (!isValidQuality(quality)) {
    return res.status(400).json({ error: 'Invalid quality selection' });
  }

  const cacheKey = `${videoId}:${quality}`;
  const cached = infoCache.get(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  try {
    const url = videoUrl;
    const info = await ytdlp.getVideoInfo(url);

    if (!info || !info.title) {
      return res.status(404).json({ error: 'Video not found or unavailable' });
    }

    // Get max available resolution
    let maxHeight = 0;
    let availableQualities = [];
    if (info?.formats) {
      const heights = new Set();
      info.formats.forEach(f => {
        if (f.height && f.height > 0) {
          heights.add(f.height);
          if (f.height > maxHeight) maxHeight = f.height;
        }
      });
      availableQualities = Array.from(heights).sort((a, b) => a - b);
    }

    const formatSelector = buildFormatSelector(quality);
    const sizeBytes = await ytdlp.getApproxFileSize(url, formatSelector);

    const payload = {
      title: info.title,
      thumbnail: info.thumbnail || '',
      duration: parseInt(info.duration, 10) || 0,
      durationStr: formatDuration(parseInt(info.duration, 10) || 0),
      author: info.uploader || 'Unknown',
      views: parseInt(info.view_count, 10) || 0,
      description: info.description ? info.description.slice(0, 200) + '...' : '',
      fileSize: formatBytes(sizeBytes) || 'Unknown',
      fileSizeBytes: sizeBytes || null,
      maxHeight: maxHeight,
      availableQualities: availableQualities,
    };

    infoCache.set(cacheKey, payload);
    res.set('X-Cache', 'MISS');
    res.json(payload);
  } catch (error) {
    logger.error('Info fetch failed:', error.message);
    res.status(502).json({ error: 'Failed to fetch video info', details: error.message });
  }
});

module.exports = router;