// main.js
(() => {
  'use strict';

  // Constants / config
  const CONFIG = {
    API_URL: `${window.location.origin}/api`,
    NOTIFICATION_DURATION: 4000,
    INFO_CACHE_TTL: 5 * 60 * 1000,
    DEBOUNCE_MS: 500,
  };

  const STATUS = {
    PENDING: 'pending',
    DOWNLOADING: 'downloading',
    COMPLETE: 'complete',
    ERROR: 'error',
  };

  // State
  const state = {
    queue: [],
    nextId: 0,
    isDownloading: false,
    infoCache: new Map(),
    currentVideoInfo: null,
    currentVideoId: null,
    debounceTimer: null,
    infoAbortController: null,
    loadingInterval: null,
    loadingDots: 0,
    notificationTimer: null,
    isOnline: navigator.onLine,
    pendingFetches: new Map(),
  };

  const renderedItems = new Map();

  const elements = {
    container: document.getElementById('queueContainer'),
    urlInput: document.getElementById('urlInput'),
    qualitySelect: document.getElementById('qualitySelect'),
    fileSizeDisplay: document.getElementById('fileSize'),
    videoTitleDisplay: document.getElementById('videoTitle'),
    addBtn: document.getElementById('addBtn'),
    themeBtn: document.getElementById('themeBtn'),
    pasteBtn: document.getElementById('pasteBtn'),
    offlineBanner: document.getElementById('offlineBanner'),
  };

  // Small helpers
  const isDarkTheme = () => document.documentElement.getAttribute('data-theme') !== 'light';

  const updateFavicon = (isDark) => {
    const favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) return;
    const color = isDark ? 'black' : 'white';
    const textColor = isDark ? 'white' : 'black';
    const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='${color}'/%3E%3Ctext x='50' y='68' font-family='Arial' font-size='50' font-weight='bold' fill='${textColor}' text-anchor='middle'%3EY%3C/text%3E%3C/svg%3E`;
    favicon.href = `data:image/svg+xml,${svg}`;
  };

  const extractVideoId = (url) => {
    if (!url) return null;
    // Try YouTube first
    const match = String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\n?#]+)/);
    if (match) return match[1];
    // If not YouTube, return the URL itself as the ID
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return null;
  };

  const isValidUrl = (url) => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const isLikelyYoutubeUrl = (url) => {
    if (!url) return false;
    return /youtube\.com|youtu\.be/.test(url);
  };

  const sanitizeFilename = (title) =>
    String(title || '').replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, ' ').trim().substring(0, 200);

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    if (seconds < 60) return Math.floor(seconds) + 's';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins + 'm ' + secs + 's';
  };

  const escapeHtml = (str) =>
    String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  // Notifications
  const showNotification = (message, type = 'info') => {
    const footerNote = document.querySelector('.footer-note');
    if (!footerNote) return;

    const colors = { success: '#4CAF50', error: '#f44336', info: '#2196F3', warning: '#FF9800' };

    const oldStatus = footerNote.querySelector('.status-indicator');
    if (oldStatus) oldStatus.remove();

    const status = document.createElement('span');
    status.className = 'status-indicator';

    const dot = document.createElement('span');
    dot.style.cssText = `display:inline-block;width:4px;height:4px;border-radius:50%;background:${colors[type] || colors.info};flex-shrink:0;animation:pulse 1.5s ease-in-out infinite;`;

    const text = document.createElement('span');
    const maxLength = 40;
    text.textContent = message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
    text.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;';

    status.appendChild(dot);
    status.appendChild(text);
    footerNote.appendChild(status);

    clearTimeout(state.notificationTimer);
    state.notificationTimer = setTimeout(() => status.remove(), CONFIG.NOTIFICATION_DURATION);
  };

  // Open downloads folder
  const openDownloadsFolder = async (filename) => {
    try {
      const qs = (filename && filename !== 'undefined') ? `?filename=${encodeURIComponent(filename)}` : '';
      const response = await fetch(`${CONFIG.API_URL}/open-folder${qs}`);
      if (response.ok) {
        showNotification('Downloads folder opened', 'success');
      } else {
        showNotification('Downloads folder opened', 'success');
      }
    } catch (error) {
      showNotification('Downloads folder opened', 'success');
    }
  };

  // Theme
  const THEME_KEY = 'yeti-theme';

  const setTheme = (dark, { persist = true } = {}) => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    updateFavicon(dark);
    if (persist) {
      try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (err) { /* storage unavailable */ }
    }
    if (window.updateSettingsThemeButton) {
      window.updateSettingsThemeButton();
    }
  };

  const loadInitialTheme = () => {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (err) { /* storage unavailable */ }
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored === 'dark', { persist: false });
      return;
    }
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    setTheme(!prefersLight, { persist: false });
  };

  const updateAddButtonState = () => {
    const url = elements.urlInput.value.trim();
    const isValid = isValidUrl(url);
    elements.addBtn.disabled = !isValid || !state.isOnline;
  };

  // Offline handling
  const updateOnlineState = () => {
    state.isOnline = navigator.onLine;
    elements.offlineBanner.classList.toggle('active', !state.isOnline);
    updateAddButtonState();
  };
  
  window.addEventListener('online', () => {
    updateOnlineState();
    showNotification('Back online', 'success');
    processQueue();
  });
  window.addEventListener('offline', () => {
    updateOnlineState();
    showNotification('You are offline', 'warning');
  });

  // Loading animation
  const startLoadingAnimation = (text) => {
    clearInterval(state.loadingInterval);
    state.loadingDots = 0;
    elements.videoTitleDisplay.textContent = text;
    elements.videoTitleDisplay.classList.remove('hidden');

    state.loadingInterval = setInterval(() => {
      state.loadingDots = (state.loadingDots % 3) + 1;
      elements.videoTitleDisplay.textContent = text + '.'.repeat(state.loadingDots) + ' '.repeat(3 - state.loadingDots);
    }, 400);
  };

  const stopLoadingAnimation = () => {
    clearInterval(state.loadingInterval);
    state.loadingInterval = null;
  };

  const updateDisplay = (title, fileSize) => {
    stopLoadingAnimation();
    if (title) {
      elements.videoTitleDisplay.textContent = sanitizeFilename(title);
      elements.videoTitleDisplay.classList.remove('hidden');
    }
    if (fileSize) {
      elements.fileSizeDisplay.textContent = fileSize;
      elements.fileSizeDisplay.classList.remove('hidden');
    }
  };

  const clearDisplay = () => {
    stopLoadingAnimation();
    elements.videoTitleDisplay.classList.add('hidden');
    elements.fileSizeDisplay.classList.add('hidden');
  };

  // Video info fetching
  const getCachedInfo = (key) => {
    const entry = state.infoCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      state.infoCache.delete(key);
      return null;
    }
    return entry.data;
  };

  const setCachedInfo = (key, data) => {
    state.infoCache.set(key, { data, expiresAt: Date.now() + CONFIG.INFO_CACHE_TTL });
  };

  const fetchVideoInfo = async (url, fetchId = null) => {
    const videoId = extractVideoId(url);
    if (!videoId) {
      showNotification('Invalid URL', 'error');
      return null;
    }

    const quality = elements.qualitySelect.value;
    const cacheKey = `${videoId}:${quality}`;

    const cached = getCachedInfo(cacheKey);
    if (cached) {
      state.currentVideoInfo = cached;
      state.currentVideoId = videoId;
      const displayTitle = cached.durationStr ? `${cached.title} (${cached.durationStr})` : cached.title;
      updateDisplay(displayTitle, cached.fileSize);
      updateAddButtonState();
      return cached;
    }

    const fetchIdentifier = fetchId || `${videoId}:${Date.now()}`;
    state.pendingFetches.set(fetchIdentifier, { videoId, quality, url });
    updateAddButtonState();

    const controller = new AbortController();
    if (!state.fetchControllers) state.fetchControllers = new Map();
    state.fetchControllers.set(fetchIdentifier, controller);

    try {
      startLoadingAnimation('Please Wait, Finding Video');
      
      if (window.YETI_LOADING) {
        window.YETI_LOADING.showProgress();
      }

      const response = await fetch(`${CONFIG.API_URL}/info/${encodeURIComponent(videoId)}?quality=${quality}`, {
        signal: controller.signal,
      });

      if (window.YETI_LOADING) {
        window.YETI_LOADING.updateProgress(60);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (window.YETI_LOADING) {
        window.YETI_LOADING.updateProgress(80);
      }

      setCachedInfo(cacheKey, data);
      state.currentVideoInfo = data;
      state.currentVideoId = videoId;

      const displayTitle = data.durationStr ? `${data.title} (${data.durationStr})` : data.title;
      updateDisplay(displayTitle, data.fileSize);

      if (window.YETI_LOADING) {
        window.YETI_LOADING.updateProgress(100);
      }

      const authorInfo = data.author ? ` by ${data.author}` : '';
      showNotification(`${data.title}${authorInfo}`, 'success');
      
      state.pendingFetches.delete(fetchIdentifier);
      if (state.fetchControllers) {
        state.fetchControllers.delete(fetchIdentifier);
      }
      updateAddButtonState();
      return data;
    } catch (error) {
      if (window.YETI_LOADING) {
        window.YETI_LOADING.hideProgress();
      }
      
      state.pendingFetches.delete(fetchIdentifier);
      if (state.fetchControllers) {
        state.fetchControllers.delete(fetchIdentifier);
      }
      
      if (error.name === 'AbortError') {
        updateAddButtonState();
        return null;
      }
      
      stopLoadingAnimation();
      showNotification(error.message, 'error');
      elements.videoTitleDisplay.textContent = 'Error';
      elements.videoTitleDisplay.classList.remove('hidden');
      elements.fileSizeDisplay.classList.add('hidden');
      
      updateAddButtonState();
      return null;
    }
  };

  // Queue rendering
  const buildQueueItemNode = (item, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'queue-item';
    wrap.dataset.id = String(item.id);

    wrap.innerHTML = `
      <span class="sno">${index + 1}</span>
      <span class="filename" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</span>
      <span class="progress-eta">
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill"></div>
        </div>
        <div class="progress-text">
          <span class="progress-left"></span>
          <span class="progress-center"></span>
          <span class="progress-right"></span>
        </div>
      </span>
      <span class="actions">
        <button data-action="redownload" title="Redownload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
        <button data-action="folder" title="Open folder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button data-action="remove" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </span>
    `;

    wrap.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;
      handleItemAction(item.id, button.dataset.action);
    });

    return wrap;
  };

  const patchQueueItemNode = (node, item, index) => {
    const isComplete = item.status === STATUS.COMPLETE;
    const isError = item.status === STATUS.ERROR;

    node.querySelector('.sno').textContent = index + 1;

    const filenameEl = node.querySelector('.filename');
    if (filenameEl.textContent !== item.filename) {
      filenameEl.textContent = item.filename;
      filenameEl.title = item.filename;
    }

    node.style.opacity = isComplete ? '0.8' : '';

    const fill = node.querySelector('.progress-bar-fill');
    const progressValue = isError ? 100 : (item.progress || 0);
    fill.style.width = `${progressValue}%`;
    fill.style.background = isComplete ? '#4CAF50' : (isError ? '#f44336' : '');

    const statusText = isComplete ? 'Complete' : (isError ? 'Failed' : (item.speedDisplay || ''));
    const rightText = isComplete ? 'Done' : (isError ? 'Error' : (item.eta || '—'));

    const centerEl = node.querySelector('.progress-center');
    if (centerEl.textContent !== statusText) centerEl.textContent = statusText;

    const rightEl = node.querySelector('.progress-right');
    if (rightEl.textContent !== rightText) rightEl.textContent = rightText;

    const redownloadBtn = node.querySelector('[data-action="redownload"]');
    if (redownloadBtn) redownloadBtn.disabled = item.status === STATUS.DOWNLOADING;
  };

  const renderQueue = () => {
    const containerEl = elements.container;

    if (!state.queue.length) {
      renderedItems.clear();
      containerEl.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'empty-queue';
      empty.textContent = 'Paste URL to add to queue';
      containerEl.appendChild(empty);
      return;
    }

    const emptyEl = containerEl.querySelector('.empty-queue');
    if (emptyEl) emptyEl.remove();

    const currentIds = new Set(state.queue.map((i) => i.id));
    for (const [id, node] of renderedItems) {
      if (!currentIds.has(id)) {
        node.remove();
        renderedItems.delete(id);
      }
    }

    const fragment = document.createDocumentFragment();
    let needsReorder = false;

    state.queue.forEach((item, index) => {
      let node = renderedItems.get(item.id);
      if (!node) {
        node = buildQueueItemNode(item, index);
        renderedItems.set(item.id, node);
        needsReorder = true;
      }
      patchQueueItemNode(node, item, index);
    });

    if (needsReorder || containerEl.children.length !== state.queue.length) {
      state.queue.forEach((item) => fragment.appendChild(renderedItems.get(item.id)));
      containerEl.replaceChildren(fragment);
    }
  };

  let renderQueued = false;
  const scheduleRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderQueue();
    });
  };

  // Queue actions
  const handleItemAction = (itemId, action) => {
    const item = state.queue.find((i) => i.id === itemId);
    if (!item) return;

    switch (action) {
      case 'remove': {
        if (item.abortController) item.abortController.abort();
        state.queue = state.queue.filter((i) => i.id !== itemId);
        renderQueue();
        break;
      }
      case 'redownload': {
        if (item.status === STATUS.DOWNLOADING) return;
        Object.assign(item, { progress: 0, eta: '—', speedDisplay: '', status: STATUS.PENDING });
        renderQueue();
        processQueue();
        break;
      }
      case 'folder': {
        const filename = item.status === STATUS.COMPLETE ? item.filename : undefined;
        openDownloadsFolder(filename);
        break;
      }
      default:
        break;
    }
  };

  // Queue processing
  const findNextPendingItem = () => state.queue.find((i) => i.status === STATUS.PENDING);

  const processQueue = async () => {
    if (!state.isOnline) return;

    const activeDownloads = state.queue.filter(i => i.status === STATUS.DOWNLOADING);
    if (activeDownloads.length >= 3) {
      return;
    }

    const nextItem = findNextPendingItem();
    if (!nextItem) {
      if (state.queue.length && state.queue.every((i) => i.status === STATUS.COMPLETE || i.status === STATUS.ERROR)) {
        showNotification('All downloads complete', 'success');
      }
      return;
    }

    startDownload(nextItem);
  };

  const startDownload = async (item) => {
    item.status = STATUS.DOWNLOADING;
    scheduleRender();

    const startTime = Date.now();
    const controller = new AbortController();
    item.abortController = controller;

    try {
      const videoId = extractVideoId(item.url);
      if (!videoId) throw new Error('Invalid video URL');

      showNotification(`Downloading: ${item.filename}`, 'info');

      const downloadUrl = `${CONFIG.API_URL}/download/${encodeURIComponent(videoId)}/${item.quality}`;
      const response = await fetch(downloadUrl, { signal: controller.signal });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Download failed');
      }

      let filename = item.filename;
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = decodeURIComponent(match[1]);
      }

      const contentLength = response.headers.get('content-length');
      const estimateHeader = response.headers.get('x-file-size-estimate');
      const totalSize = contentLength ? parseInt(contentLength, 10) : (estimateHeader ? parseInt(estimateHeader, 10) : 0);

      const reader = response.body.getReader();
      const chunks = [];
      let downloaded = 0;
      let lastRenderTime = 0;

      const updateProgress = () => {
        const now = Date.now();
        if (now - lastRenderTime < 200) return;
        lastRenderTime = now;

        if (totalSize > 0) {
          const percent = Math.min(99, Math.floor((downloaded / totalSize) * 100));
          item.progress = percent;
          const remaining = totalSize - downloaded;
          const elapsed = (now - startTime) / 1000;
          const speed = elapsed > 0 ? downloaded / elapsed : 0;
          item.eta = speed > 0 ? formatTime(remaining / speed) : '—';
        } else {
          item.progress = Math.min(95, item.progress + 1);
          item.eta = '—';
        }

        const elapsed = (now - startTime) / 1000;
        const speed = elapsed > 0 ? downloaded / elapsed : 0;
        item.speedDisplay = `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
        scheduleRender();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        downloaded += value.length;
        updateProgress();
      }

      const blob = new Blob(chunks);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);

      item.progress = 100;
      item.eta = 'Done';
      item.speedDisplay = '';
      item.filename = filename;
      item.status = STATUS.COMPLETE;
      renderQueue();

      showNotification(`Downloaded: ${filename}`, 'success');
    } catch (error) {
      if (error.name === 'AbortError') {
        item.status = STATUS.PENDING;
        item.progress = 0;
        item.eta = '—';
        showNotification('Download cancelled', 'info');
      } else {
        showNotification(`Download failed: ${error.message}`, 'error');
        item.status = STATUS.ERROR;
        item.eta = 'Failed';
      }
      renderQueue();
    } finally {
      item.abortController = null;
      setTimeout(() => processQueue(), 300);
    }
  };

  // Add-to-queue flow
  const handleUrlInput = async () => {
    const url = elements.urlInput.value.trim();
    updateAddButtonState();

    if (isValidUrl(url)) {
      startLoadingAnimation('Loading');
      elements.fileSizeDisplay.textContent = '...';
      elements.fileSizeDisplay.classList.remove('hidden');
      await fetchVideoInfo(url);
    } else if (url) {
      stopLoadingAnimation();
      elements.videoTitleDisplay.textContent = 'Invalid URL';
      elements.videoTitleDisplay.classList.remove('hidden');
      elements.fileSizeDisplay.classList.add('hidden');
    } else {
      clearDisplay();
      state.currentVideoInfo = null;
      state.currentVideoId = null;
    }
  };

  const isDuplicateInQueue = (videoId, quality) =>
    state.queue.some(
      (i) => extractVideoId(i.url) === videoId && i.quality === quality && i.status !== STATUS.ERROR
    );

  const addDownload = async () => {
    const url = elements.urlInput.value.trim();

    if (!url) {
      elements.urlInput.focus();
      showNotification('Please paste a video URL', 'warning');
      return;
    }

    if (!isValidUrl(url)) {
      showNotification('Please enter a valid URL', 'error');
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      showNotification('Could not read video ID from URL', 'error');
      return;
    }

    const quality = elements.qualitySelect.value;

    const isFromExtension = window._pendingExtensionAdd;
    if (!isFromExtension) {
      if (isDuplicateInQueue(videoId, quality)) {
        showNotification('Already in queue at this quality', 'warning');
        return;
      }
    }

    const fetchId = `${videoId}:${Date.now()}`;
    const videoInfo = await fetchVideoInfo(url, fetchId);
    if (!videoInfo) return;

    const title = videoInfo ? sanitizeFilename(videoInfo.title) : `video_${videoId}`;
    const ext = quality === 'audio' ? 'mp3' : 'mp4';
    const qualityLabel = quality === 'audio' ? 'audio' : `${quality}p`;
    const filename = `${title}_${qualityLabel}.${ext}`;

    const item = {
      id: ++state.nextId,
      url,
      quality,
      filename,
      progress: 0,
      eta: '—',
      speedDisplay: '',
      status: STATUS.PENDING,
      abortController: null,
    };

    state.queue.push(item);
    renderQueue();
    processQueue();

    if (!isFromExtension) {
      elements.urlInput.value = '';
      clearDisplay();
      state.currentVideoInfo = null;
      state.currentVideoId = null;
    }
    window._pendingExtensionAdd = false;
    updateAddButtonState();
  };

  // Event listeners
  elements.themeBtn.addEventListener('click', () => setTheme(!isDarkTheme()));

  elements.pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        elements.urlInput.value = text;
        updateAddButtonState();
        await handleUrlInput();
        elements.urlInput.focus();
        if (isValidUrl(text)) showNotification('URL pasted', 'info');
      }
    } catch (err) {
      showNotification('Could not read clipboard', 'error');
    }
  });

  elements.urlInput.addEventListener('input', () => {
    updateAddButtonState();
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(handleUrlInput, CONFIG.DEBOUNCE_MS);
  });

  elements.qualitySelect.addEventListener('change', () => {
    updateAddButtonState();
    const url = elements.urlInput.value.trim();
    if (isValidUrl(url)) {
      startLoadingAnimation('Loading');
      fetchVideoInfo(url);
    }
  });

  elements.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDownload();
    }
  });

  elements.addBtn.addEventListener('click', addDownload);

  // External URL via query param
  const urlParams = new URLSearchParams(window.location.search);
  const externalUrl = urlParams.get('url');
  if (externalUrl && isValidUrl(externalUrl)) {
    elements.urlInput.value = externalUrl;
    setTimeout(() => handleUrlInput(), 200);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Listen for messages from extension
  window.addEventListener('message', async (e) => {
    if (e.data?.type === 'ADD_URL_TO_QUEUE' && e.data.url) {
      window._pendingExtensionAdd = true;
      elements.urlInput.value = e.data.url;
      if (e.data.quality) {
        elements.qualitySelect.value = e.data.quality;
        elements.qualitySelect.dispatchEvent(new Event('change'));
      }
      elements.urlInput.dispatchEvent(new Event('input'));
      await new Promise(resolve => setTimeout(resolve, 1000));
      await addDownload();
      elements.urlInput.value = '';
      clearDisplay();
      state.currentVideoInfo = null;
      state.currentVideoId = null;
      updateAddButtonState();
    }
  });

  if (window.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'ADD_URL_TO_QUEUE' && request.url) {
        window._pendingExtensionAdd = true;
        elements.urlInput.value = request.url;
        if (request.quality) {
          elements.qualitySelect.value = request.quality;
          elements.qualitySelect.dispatchEvent(new Event('change'));
        }
        elements.urlInput.dispatchEvent(new Event('input'));
        setTimeout(async () => {
          await addDownload();
          elements.urlInput.value = '';
          clearDisplay();
          state.currentVideoInfo = null;
          state.currentVideoId = null;
          updateAddButtonState();
          sendResponse({ success: true });
        }, 1000);
        return true;
      }
    });
  }

  // Warn before leaving
  window.addEventListener('beforeunload', (e) => {
    if (state.isDownloading) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Expose to global
  window.state = state;
  window.renderedItems = renderedItems;
  window.setTheme = setTheme;
  window.isDarkTheme = isDarkTheme;
  window.openDownloadsFolder = openDownloadsFolder;
  window.renderQueue = renderQueue;
  window.showNotification = showNotification;

  // Init
  if (!document.getElementById('yeti-styles')) {
    const style = document.createElement('style');
    style.id = 'yeti-styles';
    style.textContent = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(style);
  }

  clearDisplay();
  loadInitialTheme();
  updateOnlineState();
  renderQueue();
  updateAddButtonState();

  setTimeout(() => {
    elements.urlInput.focus();
    elements.urlInput.select();
  }, 150);

  console.log('YETI Downloader ready');
})();