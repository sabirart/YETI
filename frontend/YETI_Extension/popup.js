// Popup script for YETI extension

document.addEventListener('DOMContentLoaded', async () => {
  const qualitySelect = document.getElementById('qualitySelect');
  const openAppBtn = document.getElementById('openApp');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // Load saved quality preference
  const storage = await chrome.storage.local.get(['quality']);
  if (storage.quality) {
    qualitySelect.value = storage.quality;
  }

  // Save quality preference
  qualitySelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ quality: qualitySelect.value });
  });

  // Open YETI app - with current video URL if on YouTube
  openAppBtn.addEventListener('click', async () => {
    const YETI_APP_URL = 'http://localhost:3001';
    
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    let urlToSend = '';
    // If on YouTube video page, get the URL
    if (tab.url && (tab.url.includes('youtube.com/watch') || tab.url.includes('youtu.be/'))) {
      urlToSend = tab.url;
    }

    // Check if YETI app tab already exists
    const tabs = await chrome.tabs.query({ url: `${YETI_APP_URL}/*` });
    
    if (tabs.length > 0) {
      // Focus the existing tab
      const tabId = tabs[0].id;
      await chrome.tabs.update(tabId, { active: true });
      
      // If we have a YouTube URL, reload with URL parameter
      if (urlToSend) {
        const newUrl = `${YETI_APP_URL}?url=${encodeURIComponent(urlToSend)}&quality=${qualitySelect.value}`;
        await chrome.tabs.update(tabId, { url: newUrl });
      }
    } else {
      // Open new tab with URL parameter if on YouTube
      let newTabUrl = YETI_APP_URL;
      if (urlToSend) {
        newTabUrl = `${YETI_APP_URL}?url=${encodeURIComponent(urlToSend)}&quality=${qualitySelect.value}`;
      }
      await chrome.tabs.create({ url: newTabUrl });
    }
  });

  // Check if YETI app is running - FIXED to just check if server is reachable
  async function checkAppStatus() {
    try {
      // Just check if the server is reachable, not the /info/test endpoint
      const response = await fetch('http://localhost:3001', {
        method: 'HEAD',
        cache: 'no-cache'
      });
      
      if (response.ok || response.status === 200) {
        statusDot.className = 'dot online';
        statusText.textContent = 'YETI App is running';
        return true;
      } else {
        statusDot.className = 'dot offline';
        statusText.textContent = 'YETI App is not running (start with: npm start)';
        return false;
      }
    } catch {
      statusDot.className = 'dot offline';
      statusText.textContent = 'YETI App is not running (start with: npm start)';
      return false;
    }
  }

  // Initial check
  await checkAppStatus();

  // Check periodically
  setInterval(checkAppStatus, 5000);

  // Get current tab info for display
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.url && (tab.url.includes('youtube.com/watch') || tab.url.includes('youtu.be/'))) {
    // Show current video info
    const videoId = tab.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (videoId) {
      const infoDiv = document.createElement('div');
      infoDiv.style.cssText = `
        font-size: 12px;
        color: #888;
        margin-top: 8px;
        padding: 8px;
        background: #222;
        border-radius: 4px;
        word-break: break-all;
      `;
      infoDiv.textContent = `Current video: ${videoId[1]}`;
      document.querySelector('.info').before(infoDiv);
    }
  }
});