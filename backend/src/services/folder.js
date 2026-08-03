const { execFile } = require('child_process');

/**
 * Open the downloads directory (optionally highlighting a file inside it)
 * using the native file manager for the current OS. Uses execFile with an
 * argument array - never a shell - so nothing here is interpolated into a
 * command string.
 */
const openInFileManager = (downloadsDir, targetFilePath) => {
  return new Promise((resolve, reject) => {
    let bin;
    let args;

    if (process.platform === 'win32') {
      bin = 'explorer';
      args = targetFilePath ? ['/select,', targetFilePath] : [downloadsDir];
    } else if (process.platform === 'darwin') {
      bin = 'open';
      args = targetFilePath ? ['-R', targetFilePath] : [downloadsDir];
    } else {
      bin = 'xdg-open';
      args = [downloadsDir];
    }

    execFile(bin, args, (error) => {
      // Windows' explorer.exe returns a non-zero exit code on success in some
      // versions; treat spawn failures (ENOENT etc.) as the real error.
      if (error && error.code === 'ENOENT') {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

module.exports = { openInFileManager };
