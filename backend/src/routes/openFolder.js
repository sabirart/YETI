const express = require('express');
const router = express.Router();
const { exec } = require('child_process');

const logger = require('../utils/logger');

router.get('/open-folder', async (req, res) => {
  try {
    // Windows Downloads folder - direct path
    const userProfile = process.env.USERPROFILE;
    const downloadsPath = userProfile + '\\Downloads';
    
    logger.info(`Opening: ${downloadsPath}`);

    // Use start command to open in normal window
    const command = `start explorer "${downloadsPath}"`;
    
    exec(command, (error) => {
      // Always return success
      res.json({ success: true });
    });
  } catch (error) {
    logger.error('Open folder error:', error.message);
    res.json({ success: true });
  }
});

module.exports = router;