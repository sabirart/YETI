// Content script that runs on YouTube pages

let buttonInjected = false;
let currentVideoId = null;
let currentVideoUrl = null;

// Check if extension context is still alive
if (!chrome.runtime?.id) {
  console.warn('Extension context invalidated — stopping.');
  throw new Error('Extension context invalidated');
}

// Extract video ID from URL
function getVideoId() {
  const url = window.location.href;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  return match ? match[1] : null;
}

// Get video URL
function getVideoUrl() {
  return window.location.href;
}

// Check if we're on a video page
function isVideoPage() {
  return window.location.pathname.includes('/watch') || 
         window.location.hostname === 'youtu.be';
}

// Create the YETI download button with dropdown
function createYetiButton() {
  const container = document.createElement('div');
  container.className = 'yeti-dropdown-container';

  // Main button
  const button = document.createElement('button');
  button.id = 'yeti-download-btn';
  button.className = 'yeti-download-btn';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    YETI Download
  `;
  button.title = 'Download with YETI';

  // Dropdown menu
  const dropdown = document.createElement('div');
  dropdown.className = 'yeti-dropdown-menu';

  // Quality options
  const qualities = [
    { value: '144', label: '144p' },
    { value: '240', label: '240p' },
    { value: '360', label: '360p' },
    { value: '480', label: '480p' },
    { value: '720', label: '720p' },
    { value: '1080', label: '1080p' },
    { value: '1440', label: '2K' },
    { value: '2160', label: '4K' },
    { value: 'audio', label: 'Audio' }
  ];

  qualities.forEach(q => {
    const item = document.createElement('div');
    item.className = 'yeti-dropdown-item';
    item.textContent = q.label;
    item.dataset.quality = q.value;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display = 'none';
      handleDownloadClick(q.value);
    });
    dropdown.appendChild(item);
  });

  // Toggle dropdown on button click
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display === 'block';
    document.querySelectorAll('.yeti-dropdown-menu').forEach(el => {
      el.style.display = 'none';
    });
    dropdown.style.display = isOpen ? 'none' : 'block';
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
  });

  container.appendChild(button);
  container.appendChild(dropdown);

  return container;
}

// Handle download button click with selected quality
async function handleDownloadClick(quality) {
  const button = document.getElementById('yeti-download-btn');
  if (!button) return;

  if (!chrome.runtime?.id) {
    showNotification('Extension reloaded — please refresh YouTube', 'error');
    return;
  }

  const storage = await chrome.storage.local.get(['quality']);
  const selectedQuality = quality || storage.quality || '720';
  
  const videoId = getVideoId();
  if (!videoId) {
    showNotification('Could not detect video ID', 'error');
    return;
  }

  // Show loading state
  const originalHTML = button.innerHTML;
  button.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
      <path d="M12 2v4M12 22v-4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M22 12h-4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  `;
  button.disabled = true;

  try {
    const url = getVideoUrl();
    
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_TO_YETI_BACKGROUND',
      url: url,
      quality: selectedQuality
    });

    if (response.success) {
      const qualityLabel = selectedQuality === 'audio' ? 'Audio' : `${selectedQuality}p`;
      showNotification(`${qualityLabel} added to queue`, 'success');
    } else {
      throw new Error(response.error || 'Failed to add');
    }
  } catch (error) {
    console.error('Download error:', error);
    showNotification('Failed to add', 'error');
  } finally {
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      YETI Download
    `;
    button.disabled = false;
  }
}

// Show notification on YouTube page
function showNotification(message, type = 'info') {
  const existing = document.querySelectorAll('.yeti-notification');
  existing.forEach(el => el.remove());

  const notification = document.createElement('div');
  notification.className = 'yeti-notification';
  notification.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    background: rgba(30, 30, 30, 0.92);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #ffffff;
    padding: 8px 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    font-weight: 400;
    z-index: 99999;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 2000);
}

// Observe URL changes
function observeUrlChanges() {
  let lastUrl = window.location.href;
  
  const observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      buttonInjected = false;
      setTimeout(injectButton, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize
function init() {
  injectButton();
  observeUrlChanges();
  
  document.addEventListener('yt-navigate-finish', () => {
    buttonInjected = false;
    setTimeout(injectButton, 500);
  });
}

// Inject button into YouTube player controls
function injectButton() {
  if (buttonInjected) return;
  if (!isVideoPage()) return;

  const videoId = getVideoId();
  if (!videoId) return;

  const selectors = [
    '.ytp-right-controls',
    '.ytp-chrome-bottom .ytp-right-controls',
    '.html5-video-player .ytp-right-controls',
    '.ytp-chrome-controls .ytp-right-controls'
  ];

  let container = null;
  for (const selector of selectors) {
    container = document.querySelector(selector);
    if (container) break;
  }

  if (!container) {
    setTimeout(injectButton, 1000);
    return;
  }

  if (document.getElementById('yeti-download-btn')) {
    buttonInjected = true;
    return;
  }

  const buttonContainer = createYetiButton();
  container.insertBefore(buttonContainer, container.firstChild);
  
  buttonInjected = true;
  currentVideoId = videoId;
  currentVideoUrl = getVideoUrl();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

setInterval(() => {
  if (isVideoPage() && !buttonInjected) {
    injectButton();
  }
}, 3000);