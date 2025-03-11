const http = require("http");
const express = require("express");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { PhysicsRoom } = require("./rooms/PhysicsRoom");
const logger = require("./lib/logger");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

// Create the Express app
const app = express();

// Enable CORS with proper configuration for production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://fling.fish', 'https://www.fling.fish'] 
    : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Serve static HTML file for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Add a simple health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Create the HTTP server
const server = http.createServer(app);

// Setup logging to file
const logFile = path.join(__dirname, './server-logs.txt');
// Clear previous log file
fs.writeFileSync(logFile, `Server started at ${new Date().toISOString()}\n`);

// Create the Colyseus server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    pingInterval: 5000, // 5 seconds (default is 10s)
    pingMaxRetries: 3   // Allow 3 retries (default is 2)
  })
});

// Register the PhysicsRoom
gameServer.define("physics_room", PhysicsRoom);

// Define the port - use environment variable for production
const port = process.env.PORT || 3002;

// Start the server
gameServer.listen(port)
  .then(() => {
    logger.log(`Colyseus server is listening on port ${port}`);
    logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    if (process.env.NODE_ENV === 'production') {
      logger.log(`WebSocket server URL: wss://fling-fish-ws.onrender.com`);
      logger.log(`HTTP server URL: https://fling-fish-ws.onrender.com`);
    } else {
      logger.log(`WebSocket server URL: ws://localhost:${port}`);
      logger.log(`HTTP server URL: http://localhost:${port}`);
    }
  })
  .catch(err => {
    logger.error("Error starting Colyseus server:", err);
  });

// Export the gameServer for potential use in other files
module.exports = { gameServer }; 