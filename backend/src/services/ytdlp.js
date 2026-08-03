const { spawn } = require('child_process');
const config = require('../config');
const logger = require('../utils/logger');

const MAX_INFO_BUFFER = 10 * 1024 * 1024; // 10MB cap on JSON metadata output

// Common flags kept in one place so every call is consistent.
const BASE_ARGS = [
  '--no-warnings',
  '--no-check-certificate',
  '--ignore-errors',
  '--extractor-args',
  'youtube:player_client=android',
  '--socket-timeout',
  '30',
];

/**
 * Run yt-dlp via spawn (never a shell) and collect bounded stdout/stderr.
 * Used only for short-lived metadata calls, never for full video downloads.
 */
const runCapture = (args, { timeoutMs = 60000 } = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytdlpPath, args, { windowsHide: true });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('yt-dlp timed out'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_INFO_BUFFER) stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.split('\n').filter(Boolean).pop() || `yt-dlp exited with code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
};

/** Confirm yt-dlp (and implicitly a usable PATH) is available at startup. */
const checkInstalled = async () => {
  try {
    const { stdout } = await runCapture(['--version'], { timeoutMs: 10000 });
    return stdout.trim();
  } catch (err) {
    return null;
  }
};

/** Fetch full video metadata as JSON. */
const getVideoInfo = async (url) => {
  const { stdout } = await runCapture(['--dump-json', ...BASE_ARGS, url], { timeoutMs: 60000 });
  if (!stdout.trim()) throw new Error('No data returned for this video');
  return JSON.parse(stdout);
};

/** Approximate file size (bytes) for a given format selector, best-effort. */
const getApproxFileSize = async (url, formatSelector) => {
  try {
    const { stdout } = await runCapture(
      ['-f', formatSelector, ...BASE_ARGS, '--print', '%(filesize_approx,filesize)s', url],
      { timeoutMs: 30000 }
    );
    const bytes = parseFloat(stdout.trim());
    return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : null;
  } catch (err) {
    return null;
  }
};

/**
 * Stream a video directly to stdout via spawn, piping straight through to an
 * HTTP response. Nothing is buffered into process memory and nothing is
 * written to disk - this is what makes large 4K downloads safe.
 *
 * Progress is parsed from yt-dlp's own stderr progress lines (it writes
 * '[download]  42.0% of ~123.45MiB at 5.20MiB/s ETA 00:30' style output even
 * when stdout is a pipe) and reported via onProgress.
 *
 * Returns a handle with `.process` (so callers can kill it on client
 * disconnect) and a `.done` promise that resolves/rejects when finished.
 */
const streamDownload = ({ url, formatSelector, isAudio, onProgress }) => {
  const args = [
    '-f',
    formatSelector,
    ...BASE_ARGS,
    '--newline',
    '--progress',
    '-o',
    '-', // write the media stream to stdout
  ];

  if (isAudio) {
    args.push('-x', '--audio-format', 'mp3');
  } else {
    // Use mp4 container for better compatibility
    args.push('--merge-output-format', 'mp4');
  }

  args.push(url);

  const child = spawn(config.ytdlpPath, args, { windowsHide: true });

  const progressRe = /(\d{1,3}(?:\.\d+)?)% of\s+~?\s*([\d.]+\s*\w+)?\s*at\s+([\d.]+\s*\w+\/s|Unknown)?\s*ETA\s+([\d:]+|Unknown)/i;

  let stderrTail = '';
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrTail = (stderrTail + text).slice(-4000);
    const match = text.match(progressRe);
    if (match && onProgress) {
      onProgress({
        percent: parseFloat(match[1]),
        totalSize: match[2] || null,
        speed: match[3] && match[3] !== 'Unknown' ? match[3] : null,
        eta: match[4] && match[4] !== 'Unknown' ? match[4] : null,
      });
    }
  });

  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderrTail.split('\n').filter(Boolean).pop() || `yt-dlp exited with code ${code}`));
    });
  });

  return { process: child, stdout: child.stdout, done };
};

module.exports = {
  checkInstalled,
  getVideoInfo,
  getApproxFileSize,
  streamDownload,
};
