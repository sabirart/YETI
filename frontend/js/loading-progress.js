// loading-progress.js
(() => {
  'use strict';

  const fill = document.getElementById('progressLineFill');
  let progressInterval = null;
  let currentProgress = 0;

  function updateProgress(percent) {
    if (percent > 100) percent = 100;
    if (percent < 0) percent = 0;
    currentProgress = percent;
    
    if (fill) {
      fill.style.width = percent + '%';
      fill.classList.remove('complete');
      
      if (percent >= 100) {
        setTimeout(() => {
          fill.classList.add('complete');
          fill.style.width = '100%';
        }, 300);
      }
    }
  }

  function showProgress() {
    if (fill) {
      fill.style.width = '0%';
      fill.classList.remove('complete');
    }
    currentProgress = 0;
    
    // Start auto-incrementing progress
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    progressInterval = setInterval(() => {
      if (currentProgress < 90) {
        // Slow down as it approaches 90%
        const increment = Math.max(0.5, (90 - currentProgress) / 30);
        currentProgress = Math.min(90, currentProgress + increment);
        if (fill) {
          fill.style.width = currentProgress + '%';
        }
      }
    }, 100);
  }

  function hideProgress() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    if (fill) {
      fill.classList.add('complete');
      fill.style.width = '100%';
    }
  }

  // Expose functions globally
  window.YETI_LOADING = {
    showProgress: showProgress,
    hideProgress: hideProgress,
    updateProgress: updateProgress
  };
})();