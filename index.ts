import http from "http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PhysicsRoom } from "./rooms/PhysicsRoom";
import { logger } from "../lib/logger";
import path from "path";
import fs from "fs";
import cors from "cors";

// Create the Express app
const app = express();

// Enable CORS
app.use(cors());

// Create the HTTP server
const server = http.createServer(app);

// Setup logging to file
const logFile = path.join(__dirname, '../server-logs.txt');
// Clear previous log file
fs.writeFileSync(logFile, `Server started at ${new Date().toISOString()}\n`);

// Create the Colyseus server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    pingInterval: 5000, // Send ping every 5 seconds
    pingMaxRetries: 3,  // Allow 3 missed pings before considering disconnected
    // Add CORS options
    verifyClient: (info, next) => {
      // Accept all connections
      next(true);
    }
  })
});

// Register the PhysicsRoom
gameServer.define("physics_room", PhysicsRoom);

// Define the port
const port = process.env.PORT || 3002;

// Start the server
gameServer.listen(port as number)
  .then(() => {
    logger.log(`Colyseus server is listening on port ${port}`);
    logger.log(`WebSocket server URL: ws://localhost:${port}`);
  })
  .catch(err => {
    logger.error("Error starting Colyseus server:", err);
  });

// Export the gameServer for potential use in other files
export { gameServer }; 