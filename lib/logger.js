const fs = require('fs');
const path = require('path');

// Log levels
const LogLevel = {
  DEBUG: 0,
  LOG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

// Current log level
let currentLogLevel = LogLevel.LOG;

// Log file path
const logFilePath = path.join(process.cwd(), 'server-logs.txt');

// Ensure log directory exists
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Helper function to format date for logs
function getTimestamp() {
  return new Date().toISOString();
}

// Helper function to write to log file
function writeToLogFile(level, message) {
  const timestamp = getTimestamp();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  
  fs.appendFileSync(logFilePath, logMessage);
}

// Logger functions
const logger = {
  setLogLevel: (level) => {
    if (Object.values(LogLevel).includes(level)) {
      currentLogLevel = level;
    }
  },
  
  debug: (...args) => {
    if (currentLogLevel <= LogLevel.DEBUG) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ');
      console.debug(message);
      writeToLogFile('DEBUG', message);
    }
  },
  
  log: (...args) => {
    if (currentLogLevel <= LogLevel.LOG) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ');
      console.log(message);
      writeToLogFile('INFO', message);
    }
  },
  
  info: (...args) => {
    if (currentLogLevel <= LogLevel.INFO) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ');
      console.info(message);
      writeToLogFile('INFO', message);
    }
  },
  
  warn: (...args) => {
    if (currentLogLevel <= LogLevel.WARN) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ');
      console.warn(message);
      writeToLogFile('WARN', message);
    }
  },
  
  error: (...args) => {
    if (currentLogLevel <= LogLevel.ERROR) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ');
      console.error(message);
      writeToLogFile('ERROR', message);
    }
  }
};

module.exports = logger; 