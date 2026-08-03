// overlay.js
(() => {
  'use strict';

  // About Topbar Tabs
  const aboutTabs = document.querySelectorAll('.about-tab');
  const aboutPanels = {
    about: document.getElementById('panel-about'),
    howto: document.getElementById('panel-howto'),
    settings: document.getElementById('panel-settings'),
    contact: document.getElementById('panel-contact'),
  };

  aboutTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      aboutTabs.forEach((t) => t.classList.remove('active'));
      Object.values(aboutPanels).forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      if (aboutPanels[tabId]) {
        aboutPanels[tabId].classList.add('active');
      }
    });
  });

  // Close overlay
  const aboutOverlay = document.getElementById('aboutOverlay');
  const closeAbout = document.getElementById('closeAbout');
  const aboutBtn = document.getElementById('aboutBtn');

  if (aboutBtn) {
    aboutBtn.addEventListener('click', () => aboutOverlay.classList.add('active'));
  }
  if (closeAbout) {
    closeAbout.addEventListener('click', () => aboutOverlay.classList.remove('active'));
  }
  if (aboutOverlay) {
    aboutOverlay.addEventListener('click', (e) => {
      if (e.target === aboutOverlay) aboutOverlay.classList.remove('active');
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') aboutOverlay.classList.remove('active');
  });

  // Settings Tab - Theme Toggle
  const settingsThemeBtn = document.getElementById('settingsThemeBtn');
  if (settingsThemeBtn) {
    settingsThemeBtn.addEventListener('click', () => {
      if (window.setTheme && window.isDarkTheme) {
        window.setTheme(!window.isDarkTheme());
      }
    });
  }

  // Settings Tab - Open Folder
  const settingsFolderBtn = document.getElementById('settingsFolderBtn');
  if (settingsFolderBtn) {
    settingsFolderBtn.addEventListener('click', () => {
      if (window.openDownloadsFolder) {
        window.openDownloadsFolder(); // Don't pass any filename
      }
    });
  }

  // Settings Tab - Clear Queue
  const settingsClearBtn = document.getElementById('settingsClearBtn');
  if (settingsClearBtn) {
    settingsClearBtn.addEventListener('click', () => {
      if (!window.state || !window.renderQueue || !window.showNotification) {
        return;
      }

      const state = window.state;
      const queue = state.queue || [];

      if (queue.length === 0) {
        window.showNotification('Queue is already empty', 'info');
        return;
      }

      if (state.isDownloading) {
        window.showNotification('Cannot clear queue while downloading', 'warning');
        return;
      }

      queue.forEach((item) => {
        if (item.abortController) {
          item.abortController.abort();
        }
      });

      state.queue = [];
      if (window.renderedItems) {
        window.renderedItems.clear();
      }
      window.renderQueue();
      window.showNotification('Queue cleared', 'success');
    });
  }

  // Update settings theme button state when theme changes
  function updateSettingsThemeButton() {
    const settingsBtn = document.getElementById('settingsThemeBtn');
    if (settingsBtn && window.isDarkTheme) {
      settingsBtn.textContent = window.isDarkTheme() ? 'Switch to Light' : 'Switch to Dark';
    }
  }

  window.updateSettingsThemeButton = updateSettingsThemeButton;
  setTimeout(updateSettingsThemeButton, 100);

  // Extension download button in About tab
  const downloadExtZip = document.getElementById('downloadExtZip');
  if (downloadExtZip) {
    downloadExtZip.addEventListener('click', () => {
      if (window.YETI_EXTENSION) {
        window.YETI_EXTENSION.downloadExtensionZip();
      }
    });
  }
})();