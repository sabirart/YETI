# YETI Downloader

A minimal, dark-themed YouTube downloader: paste a URL, pick a quality, queue it up.

## Requirements

- Node.js 18+
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp#installation) installed and on your `PATH`
- `ffmpeg` installed and on your `PATH` (used by yt-dlp to merge video+audio and to encode audio-only downloads)

## Setup

```bash
cd backend
cp .env.example .env      # adjust values if needed
npm install
npm start
```

Then open `http://localhost:3001` (or whatever `PORT` you set).

On startup the server checks that `yt-dlp` is reachable and exits with a clear
error if it isn't, so you don't spend time debugging failed downloads that
are actually a missing binary.

## Configuration

All configuration lives in `backend/.env` (see `.env.example` for the full list):

- `PORT` - port the server listens on
- `ALLOWED_ORIGINS` - comma-separated list of origins allowed to call the API (CORS)
- `DOWNLOADS_DIR` - where files are saved / where "open folder" points
- `YTDLP_PATH` - path to the yt-dlp binary if it's not on `PATH`
- `MAX_CONCURRENT_JOBS` - how many downloads can run at once server-side
- `RATE_LIMIT_*` - request rate limits
- `LOG_LEVEL` - `error` | `warn` | `info` | `debug`

## What changed from the original version

**Security**

- Command injection is gone: every shell-out to `yt-dlp` or the OS file
  manager now uses `spawn`/`execFile` with an argument array, never a
  string built by concatenating user input into a shell command. This
  closes the `/api/open-folder` injection hole and the same class of bug
  that existed in the info/download endpoints.
- `videoId` is validated against YouTube's actual ID format
  (`^[A-Za-z0-9_-]{11}$`) before it touches yt-dlp or a URL. `quality` is
  checked against a fixed whitelist. `filename` for open-folder is resolved
  with `path.basename` + a containment check against the downloads
  directory, so path traversal (`../../etc/passwd`) is rejected.
- CORS now defaults to same-origin only, configurable via `ALLOWED_ORIGINS`
  instead of `origin: '*'`.
- `helmet` adds standard security headers plus a CSP.
- `express-rate-limit` caps general API traffic and applies a stricter cap
  to the download endpoint specifically.
- Error responses no longer leak internal error details in production.

**Performance / correctness**

- Downloads now stream: `yt-dlp -o -` writes the media straight to its own
  stdout, which is piped directly into the HTTP response via `spawn`. Nothing
  is buffered into Node's memory and nothing touches disk on the server,
  which is what was crashing on large 4K files (the old code also risked
  hitting `exec`'s default 1MB output buffer since yt-dlp's own progress
  text is written to stdout during a run).
- If the browser disconnects mid-download, the server kills the yt-dlp
  process instead of letting it run to completion for nobody.
- Video info responses are cached server-side (5 min TTL) and client-side,
  so re-checking the same video/quality doesn't re-spawn yt-dlp or re-fetch
  over the network.
- The queue now has a real state machine (`pending → downloading →
  complete | error`) instead of overloading `progress` with a magic `-1`
  for errors, which fixes the class of bugs where a failed or completed
  item could get silently reprocessed or re-block the queue.
- Duplicate downloads (same video + same quality already queued) are now
  rejected before they're added.
- Queue re-renders patch existing DOM nodes instead of replacing
  `innerHTML` on every progress tick, and progress updates are throttled to
  ~5/sec via `requestAnimationFrame` so the UI stays responsive during fast
  downloads.
- Stale info requests are aborted (`AbortController`) when the user keeps
  typing, so a slow earlier request can't overwrite a newer result.

**Reliability / UX**

- Theme preference is now persisted (`localStorage`), falling back to the
  OS `prefers-color-scheme` on first visit.
- An offline banner appears when the browser loses connectivity, and the
  add button is disabled until it's back; the queue resumes automatically
  when connectivity returns.
- Clearer, more specific error messages throughout (invalid URL, invalid
  quality, server busy, etc.) instead of generic failures.
- `/api/health` reports server + yt-dlp status.

**Format note:** to stream a merged video+audio download straight to the
response without ever writing a temp file, the container is `.mkv` (an mp4
container needs to seek backward to place its metadata atom, which isn't
possible on a one-way pipe). Audio-only downloads are still `.mp3`. Every
other piece of existing functionality - queue, progress bars with ETA and
speed, redownload, remove, open folder, theme toggle, about dialog,
quality selector - works exactly as before.

## Project structure

```
backend/
  server.js               entry point
  src/
    config.js              env-driven configuration
    middleware/
      security.js           helmet, cors, rate limiters
      errorHandler.js        404 + centralized error handling
    routes/
      info.js                GET /api/info/:videoId
      download.js             GET /api/download/:videoId/:quality (streaming)
      openFolder.js            GET /api/open-folder
      health.js                GET /api/health
    services/
      ytdlp.js                spawn-based yt-dlp wrapper (info + streaming)
      folder.js                cross-platform "reveal in file manager"
    utils/
      validate.js             whitelist validation, filename sanitizing
      ttlCache.js              tiny in-memory TTL cache
      logger.js                leveled logger
frontend/
  index.html
  css/main.css, css/responsive.css
  js/main.js
```
