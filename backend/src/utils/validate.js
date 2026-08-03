const path = require('path');
const config = require('../config');

// YouTube video IDs are exactly 11 chars of [A-Za-z0-9_-].
// This is the single source of truth for "is this a safe video id" -
// every route must validate through this before it touches yt-dlp or the filesystem.
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const isValidVideoId = (id) => typeof id === 'string' && VIDEO_ID_RE.test(id);

const isValidQuality = (quality) =>
  typeof quality === 'string' && config.allowedQualities.includes(quality);

const buildWatchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

// Build the yt-dlp format selector from a whitelisted quality string.
// Never derived from raw user input beyond the whitelist check above.
const buildFormatSelector = (quality) => {
  if (quality === 'audio') return 'bestaudio/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best';
  return `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${quality}]+bestaudio/best`;
};

// Strip anything that isn't safe in a filename. Applied to titles that come
// back from yt-dlp (untrusted, since they reflect arbitrary video metadata).
const sanitizeFilename = (title) => {
  return String(title || 'video')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
    .replace(/[^\w\s\-.,()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150) || 'video';
};

// Only ever allow a bare filename (no path separators, no traversal) to be
// resolved against the downloads directory. Returns null if unsafe.
const safeResolveInDownloads = (downloadsDir, filename) => {
  if (!filename || typeof filename !== 'string') return null;
  const base = path.basename(filename);
  if (base !== filename) return null; // contained a path separator
  if (base === '.' || base === '..') return null;
  const resolved = path.resolve(downloadsDir, base);
  const dirResolved = path.resolve(downloadsDir) + path.sep;
  if (!resolved.startsWith(dirResolved)) return null; // traversal attempt
  return resolved;
};

const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

module.exports = {
  isValidVideoId,
  isValidQuality,
  buildWatchUrl,
  buildFormatSelector,
  sanitizeFilename,
  safeResolveInDownloads,
  isValidUrl,
};
