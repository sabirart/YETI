const config = require('../config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[config.logLevel] ?? LEVELS.info;

const timestamp = () => new Date().toISOString();

const build = (level) => (...args) => {
  if (LEVELS[level] > currentLevel) return;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${timestamp()}] [${level.toUpperCase()}]`, ...args);
};

module.exports = {
  error: build('error'),
  warn: build('warn'),
  info: build('info'),
  debug: build('debug'),
};
