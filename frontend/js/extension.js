(function() {
  'use strict';

  function downloadExtensionZip() {
    const link = document.createElement('a');
    link.href = '/api/download-extension';
    link.download = 'Yeti_Extension.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function showNotification(message, type = 'info') {
    console.log(message);
  }

  window.YETI_EXTENSION = {
    downloadExtensionZip: downloadExtensionZip,
    showNotification: showNotification
  };

})();