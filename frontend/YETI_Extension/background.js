// Background service worker for YETI extension

const YETI_APP_URL = 'http://localhost:3001';
const YETI_API_URL = 'http://localhost:3001/api';

let yetiTabId = null; // Track the YETI app tab
let isPageReady = false;

// Check if YETI app is running
async function checkAppRunning() {
  try {
    const response = await fetch(`${YETI_API_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// Wait for page to be fully ready
async function waitForPageReady(tabId, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkReady = async () => {
      try {
        // Try to send a ping to the page
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        resolve(true);
        return;
      } catch {
        // Page not ready yet
      }
      
      if (Date.now() - startTime > timeout) {
        resolve(false);
        return;
      }
      
      setTimeout(checkReady, 500);
    };
    
    // Also listen for page load
    const listener = (tabIdUpdated, info) => {
      if (tabIdUpdated === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // Give it a bit more time for scripts to initialize
        setTimeout(() => {
          checkReady();
        }, 1000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Start checking immediately
    setTimeout(checkReady, 500);
  });
}

// Find or create YETI app tab (only once)
async function getOrCreateYetiTab() {
  // If we already have a tab ID, check if it still exists
  if (yetiTabId) {
    try {
      const tab = await chrome.tabs.get(yetiTabId);
      if (tab && tab.url && tab.url.includes('localhost:3001')) {
        return tab;
      }
    } catch {
      yetiTabId = null;
    }
  }

  // Look for existing YETI tab
  const tabs = await chrome.tabs.query({ url: `${YETI_APP_URL}/*` });
  if (tabs.length > 0) {
    yetiTabId = tabs[0].id;
    return tabs[0];
  }

  // No tab exists - create one (only once)
  const newTab = await chrome.tabs.create({ url: YETI_APP_URL, active: false });
  yetiTabId = newTab.id;
  
  // Wait for page to be fully ready
  await waitForPageReady(newTab.id);
  
  return newTab;
}

// Send URL to YETI app in background (no reload, no focus)
async function sendUrlToYetiBackground(url, quality = '720') {
  try {
    // Get or create YETI tab (silent)
    const tab = await getOrCreateYetiTab();
    
    // Try to send message to content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'ADD_URL_TO_QUEUE',
        url: url,
        quality: quality
      });
      
      if (response && response.success) {
        return { success: true, method: 'message' };
      } else {
        throw new Error('Message failed');
      }
    } catch (error) {
      // Content script not loaded or not responding, inject script directly
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (url, quality) => {
          // This runs in the page context
          // Wait for elements to be ready
          let attempts = 0;
          const maxAttempts = 20;
          
          const tryAddVideo = () => {
            attempts++;
            const urlInput = document.getElementById('urlInput');
            const qualitySelect = document.getElementById('qualitySelect');
            const addBtn = document.getElementById('addBtn');
            
            if (urlInput && addBtn) {
              urlInput.value = url;
              
              if (qualitySelect && quality) {
                qualitySelect.value = quality;
                qualitySelect.dispatchEvent(new Event('change'));
              }
              
              urlInput.dispatchEvent(new Event('input'));
              
              // Wait for video info to load, then click add
              setTimeout(() => {
                addBtn.click();
              }, 1500);
              
              return true;
            } else if (attempts < maxAttempts) {
              // Elements not ready, try again
              setTimeout(tryAddVideo, 500);
              return false;
            }
            return false;
          };
          
          tryAddVideo();
        },
        args: [url, quality]
      });
      
      return { success: true, method: 'inject' };
    }
  } catch (error) {
    console.error('Failed to send URL to YETI:', error);
    return { success: false, error: error.message };
  }
}

// Message listener
if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SEND_TO_YETI_BACKGROUND') {
      sendUrlToYetiBackground(request.url, request.quality)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
    
    if (request.type === 'CHECK_APP') {
      checkAppRunning()
        .then(running => sendResponse({ running }))
        .catch(() => sendResponse({ running: false }));
      return true;
    }
    
    if (request.type === 'OPEN_YETI_APP') {
      getOrCreateYetiTab()
        .then(tab => {
          chrome.tabs.update(tab.id, { active: true });
          sendResponse({ success: true });
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
    
    if (request.type === 'PING') {
      sendResponse({ success: true, ready: true });
      return true;
    }
  });
}