const { Room } = require("colyseus");
const { PhysicsState, Shape } = require("../schema/PhysicsState");
const logger = require("../lib/logger");

class PhysicsRoom extends Room {
  // Physics simulation settings
  constructor() {
    super();
    this.SIMULATION_INTERVAL_MS = 16; // ~60 fps
    this.MAX_SHAPES_PER_PLAYER = 5;
    this.playerIdToSessionId = new Map(); // Map player IDs to session IDs
    this.sessionIdToPlayerId = new Map(); // Map session IDs to player IDs
    
    // Set to false to keep the room alive even when all clients disconnect
    this.autoDispose = false;
    
    // Set a longer seat reservation time (in milliseconds)
    this.seatReservationTime = 300000; // 5 minutes (300000ms)
    
    // Track the last activity time to avoid disposing the room too quickly
    this.lastActivityTime = Date.now();
  }

  onCreate(options) {
    logger.log("PhysicsRoom created!", options);
    
    // Initialize the room state
    this.setState(new PhysicsState());
    
    // Set up physics simulation interval
    this.setSimulationInterval(() => this.update(), this.SIMULATION_INTERVAL_MS);
    
    // Register message handlers
    this.onMessage("shape_update", (client, message) => {
      this.handleShapeUpdate(client, message);
    });
    
    this.onMessage("physics_action", (client, message) => {
      this.handlePhysicsAction(client, message);
    });
    
    this.onMessage("create_shape", (client) => {
      this.handleCreateShape(client);
    });
    
    this.onMessage("remove_shape", (client, message) => {
      this.handleRemoveShape(client, message);
    });
    
    // Add handler for changing block color
    this.onMessage("change_block_color", (client, message) => {
      this.handleChangeBlockColor(client, message);
    });
    
    // Add a ping message handler to keep the connection alive
    this.onMessage("ping", (client) => {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send("pong", { timestamp: Date.now() });
          this.lastActivityTime = Date.now(); // Update last activity time
        } else {
          logger.debug(`Client ${client.sessionId} not ready for pong, state: ${client.readyState}`);
        }
      } catch (error) {
        logger.debug(`Error sending pong to client ${client.sessionId}: ${error.message}`);
      }
    });
    
    logger.log("PhysicsRoom initialized with simulation interval:", this.SIMULATION_INTERVAL_MS);
    
    // Set up a periodic check to log room status
    this.setSimulationInterval(() => {
      // Check room status
      const connectedPlayers = Array.from(this.state.players.values())
        .filter(player => !player.disconnected)
        .length;
      
      const disconnectedPlayers = Array.from(this.state.players.values())
        .filter(player => player.disconnected)
        .length;
      
      // Only log occasionally to avoid spamming
      if (this.state.serverTime % 60000 < 16) { // Log roughly every minute
        logger.log(`Room status: ${connectedPlayers} connected, ${disconnectedPlayers} disconnected players`);
        
        // Log client connection details
        logger.log(`Connected clients: ${this.clients.length}`);
        this.clients.forEach(client => {
          logger.log(`Client ${client.sessionId} - readyState: ${client.readyState}`);
        });
        
        // Check if the room has been inactive for too long (5 minutes)
        const inactiveTime = Date.now() - this.lastActivityTime;
        logger.log(`Room inactive for ${Math.floor(inactiveTime / 1000)} seconds`);
        
        if (inactiveTime > 300000 && connectedPlayers === 0) { // 5 minutes
          logger.log("Room has been inactive for too long, disposing");
          this.disconnect();
        }
      }
    }, 60000); // Check every minute
    
    // Set up periodic check for out-of-bounds shapes
    this.setSimulationInterval(() => {
      this.checkAndResetOutOfBoundsShapes();
    }, 1000); // Check every second
  }

  onJoin(client, options = {}) {
    logger.log(`Client joined: ${client.sessionId}`, options);
    this.lastActivityTime = Date.now(); // Update last activity time
    
    // Log client connection details
    logger.log(`Client connection details - ID: ${client.id}, sessionId: ${client.sessionId}`);
    if (client.auth) {
      logger.log(`Client auth: ${JSON.stringify(client.auth)}`);
    }
    
    let playerId = client.sessionId;
    let isReconnection = false;
    
    // If a playerId was provided in options, use that instead
    if (options.playerId) {
      playerId = options.playerId;
      logger.log(`Using provided playerId: ${playerId}`);
      
      // Check if this player already exists
      const existingPlayer = this.state.getPlayer(playerId);
      if (existingPlayer) {
        // This is a reconnection
        isReconnection = true;
        logger.log(`Player ${playerId} is reconnecting`);
        
        // Player exists, update the connection status
        this.state.markPlayerConnected(playerId, true);
        
        // Update the mapping
        this.playerIdToSessionId.set(playerId, client.sessionId);
        this.sessionIdToPlayerId.set(client.sessionId, playerId);
        
        // Check if player has any shapes - if not, create one
        if (existingPlayer.shapes.length === 0) {
          const initialShape = this.state.createShapeForPlayer(playerId);
          logger.log(`Created initial shape ${initialShape?.id} for reconnected player ${playerId} with no shapes`);
        } else if (existingPlayer.shapes.length > 1) {
          // If player somehow has more than one shape, remove extras
          logger.log(`Player ${playerId} has ${existingPlayer.shapes.length} shapes, removing extras`);
          
          // Keep only the first shape
          const shapeToKeep = existingPlayer.shapes[0].id;
          
          // Remove all other shapes
          for (let i = 1; i < existingPlayer.shapes.length; i++) {
            const shapeId = existingPlayer.shapes[i].id;
            existingPlayer.removeShape(shapeId);
            logger.log(`Removed extra shape ${shapeId} for player ${playerId}`);
          }
        } else {
          logger.log(`Player ${playerId} successfully reconnected with ${existingPlayer.shapes.length} shapes`);
        }
      } else {
        logger.log(`No existing player found with ID: ${playerId}, creating new player`);
      }
    }
    
    // If not a reconnection, create a new player
    if (!isReconnection) {
      const player = this.state.createPlayer(playerId);
      
      // Store the mapping
      this.playerIdToSessionId.set(playerId, client.sessionId);
      this.sessionIdToPlayerId.set(client.sessionId, playerId);
      
      // Create initial shape for the player - only if they don't have any shapes
      if (player.shapes.length === 0) {
        const initialShape = this.state.createShapeForPlayer(playerId);
        logger.log(`Created player ${playerId} with initial shape ${initialShape?.id}`);
      } else {
        logger.log(`Created player ${playerId} with ${player.shapes.length} existing shapes`);
      }
    }
    
    // Set up a ping interval to keep the connection alive
    if (client.pingInterval) {
      clearInterval(client.pingInterval);
    }
    
    client.pingInterval = setInterval(() => {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send("ping", { timestamp: Date.now() });
        } else {
          logger.warn(`Client ${client.sessionId} not ready for ping, state: ${client.readyState}`);
          clearInterval(client.pingInterval);
          client.pingInterval = null;
        }
      } catch (e) {
        logger.error(`Error sending ping to client ${client.sessionId}:`, e);
        clearInterval(client.pingInterval);
        client.pingInterval = null;
      }
    }, 5000); // Ping every 5 seconds
  }

  onLeave(client, consented) {
    logger.log(`Client left: ${client.sessionId} (consented: ${consented})`);
    this.lastActivityTime = Date.now(); // Update last activity time
    
    // Clear ping interval
    if (client.pingInterval) {
      clearInterval(client.pingInterval);
      client.pingInterval = null;
    }
    
    // Find the player ID associated with this session
    const playerId = this.sessionIdToPlayerId.get(client.sessionId);
    
    if (!playerId) {
      logger.warn(`Could not find player ID for session ${client.sessionId}`);
      return;
    }
    
    // Get the player's shapes before they're removed
    const player = this.state.getPlayer(playerId);
    if (player) {
      // Log the shapes that will be removed
      logger.log(`Player ${playerId} disconnected with ${player.shapes.length} shapes`);
      
      // Immediately remove all shapes for this player
      if (player.shapes.length > 0) {
        logger.log(`Removing ${player.shapes.length} shapes for disconnected player ${playerId}`);
        
        while (player.shapes.length > 0) {
          const shapeId = player.shapes[0].id;
          player.removeShape(shapeId);
          logger.log(`Removed shape ${shapeId} for disconnected player ${playerId}`);
        }
      }
      
      // Remove the player from the state
      this.state.removePlayer(playerId);
      logger.log(`Removed player ${playerId} from state`);
    }
    
    // Clean up mappings
    this.sessionIdToPlayerId.delete(client.sessionId);
    this.playerIdToSessionId.delete(playerId);
    
    // Broadcast to all clients that this player has been removed
    this.broadcast("player_removed", { playerId });
  }

  onDispose() {
    logger.log("Room is being disposed...");
    // Clean up any resources
    
    // Clear all intervals
    for (const client of this.clients) {
      if (client.pingInterval) {
        clearInterval(client.pingInterval);
        client.pingInterval = null;
      }
    }
    
    logger.log("Room disposed");
  }

  update() {
    // This is where we would update physics if we were running a full simulation on the server
    // For now, we'll just rely on client updates and validate them
    
    // Update server time
    this.state.serverTime = Date.now();
    
    // Only log occasionally to avoid spamming the logs
    if (this.state.serverTime % 10000 < 16) { // Log roughly every 10 seconds
      const connectedPlayers = Array.from(this.state.players.values())
        .filter(player => !player.disconnected)
        .length;
      
      const disconnectedPlayers = Array.from(this.state.players.values())
        .filter(player => player.disconnected)
        .length;
      
      if (connectedPlayers > 0 || disconnectedPlayers > 0) {
        logger.log(`Active players: ${connectedPlayers} connected, ${disconnectedPlayers} disconnected`);
        
        // Log client connection details
        logger.log(`Connected clients: ${this.clients.length}`);
        this.clients.forEach(client => {
          logger.log(`Client ${client.sessionId} - readyState: ${client.readyState}`);
        });
      }
      
      // Clean up inactive players
      const removedCount = this.state.cleanupInactivePlayers(300000); // 5 minutes
      if (removedCount > 0) {
        logger.log(`Cleaned up ${removedCount} inactive players`);
      }
    }
  }

  handleShapeUpdate(client, message) {
    if (!message.shapes || !Array.isArray(message.shapes)) {
      logger.warn(`Invalid shape update from ${client.sessionId}: missing shapes array`);
      return;
    }
    
    // Find the player ID associated with this session
    const playerId = this.sessionIdToPlayerId.get(client.sessionId);
    
    if (!playerId) {
      // Silently ignore messages from sessions without player IDs
      // This happens when processing messages from disconnected clients
      return;
    }
    
    const player = this.state.getPlayer(playerId);
    if (!player) {
      logger.warn(`Player not found for shape update: ${playerId}`);
      return;
    }
    
    // Get the standard boundaries
    const boundaries = {
      width: this.state.boundaryWidth,
      height: this.state.boundaryHeight
    };
    
    // Define the out-of-bounds threshold
    const threshold = 200;
    
    // Process each shape update
    message.shapes.forEach((shapeData) => {
      if (!this.validateShapeData(shapeData)) {
        logger.warn(`Invalid shape data from ${playerId}:`, shapeData);
        return;
      }
      
      // Find the shape in the player's shapes
      const existingShape = player.shapes.find(s => s.id === shapeData.id);
      
      if (existingShape) {
        // Check if the shape is within reasonable bounds before updating
        const isWithinBounds = 
          shapeData.x >= -threshold && 
          shapeData.x <= boundaries.width + threshold && 
          shapeData.y >= -threshold && 
          shapeData.y <= boundaries.height + threshold;
        
        if (isWithinBounds) {
          // Update existing shape
          existingShape.setPosition(shapeData.x, shapeData.y, shapeData.angle);
          existingShape.setVelocity(shapeData.velocity.x, shapeData.velocity.y);
          existingShape.lastUpdate = Date.now();
          
          // Log significant position changes for debugging
          if (Math.abs(shapeData.x) > 5000 || Math.abs(shapeData.y) > 5000) {
            logger.warn(`Unusually large position for shape ${shapeData.id}: (${shapeData.x}, ${shapeData.y})`);
          }
        } else {
          logger.warn(`Rejecting out-of-bounds update for shape ${shapeData.id}: (${shapeData.x}, ${shapeData.y})`);
        }
      }
    });
    
    // Update player's last activity time
    player.lastActivity = Date.now();
  }

  handlePhysicsAction(client, message) {
    if (!message.action || !message.action.type || !message.action.shapeId) {
      logger.warn(`Invalid physics action from ${client.sessionId}:`, message);
      return;
    }
    
    // Find the player ID associated with this session
    const playerId = this.sessionIdToPlayerId.get(client.sessionId);
    
    if (!playerId) {
      // Silently ignore messages from sessions without player IDs
      // This happens when processing messages from disconnected clients
      return;
    }
    
    const player = this.state.getPlayer(playerId);
    if (!player) {
      logger.warn(`Player not found for physics action: ${playerId}`);
      return;
    }
    
    const { action } = message;
    const shape = player.shapes.find(s => s.id === action.shapeId);
    
    if (!shape) {
      // Check if this shape belongs to another player - if so, reject the action
      let belongsToAnotherPlayer = false;
      this.state.players.forEach((otherPlayer, otherPlayerId) => {
        if (otherPlayerId !== playerId) {
          const otherPlayerHasShape = otherPlayer.shapes.some(s => s.id === action.shapeId);
          if (otherPlayerHasShape) {
            belongsToAnotherPlayer = true;
            logger.warn(`Player ${playerId} attempted to modify shape ${action.shapeId} belonging to player ${otherPlayerId}`);
          }
        }
      });
      
      if (belongsToAnotherPlayer) {
        // Reject the action - player doesn't own this shape
        return;
      }
      
      // If we get here, the shape doesn't exist for any player
      logger.debug(`Shape not found for physics action: ${action.shapeId}`);
      return;
    }
    
    // Handle different action types
    switch (action.type) {
      case 'position':
        if (typeof action.x !== 'number' || typeof action.y !== 'number') {
          logger.warn(`Invalid position data in physics action from ${playerId}`);
          return;
        }
        
        // Update the shape in the server state
        shape.setPosition(action.x, action.y, action.angle);
        
        if (action.velocity) {
          shape.setVelocity(action.velocity.x, action.velocity.y);
        }
        
        // Update the last update timestamp to track activity
        shape.lastUpdate = Date.now();
        
        // Log significant position changes for debugging - increased threshold from 1000 to 5000
        if (Math.abs(action.x) > 5000 || Math.abs(action.y) > 5000) {
          logger.warn(`Unusually large position for shape ${action.shapeId}: (${action.x}, ${action.y})`);
        }
        break;
        
      case 'impulse':
        if (!action.velocity || typeof action.velocity.x !== 'number' || typeof action.velocity.y !== 'number') {
          logger.warn(`Invalid velocity data in physics action from ${playerId}`);
          return;
        }
        
        // Update the velocity in the server state
        shape.setVelocity(action.velocity.x, action.velocity.y);
        
        // Update the last update timestamp to track activity
        shape.lastUpdate = Date.now();
        
        // Log significant impulses for debugging
        if (Math.abs(action.velocity.x) > 50 || Math.abs(action.velocity.y) > 50) {
          logger.warn(`Unusually large impulse for shape ${action.shapeId}: (${action.velocity.x}, ${action.velocity.y})`);
        }
        break;
        
      default:
        logger.warn(`Unknown physics action type: ${action.type}`);
        return; // Don't broadcast unknown action types
    }
    
    // Broadcast the action to other clients with high priority
    this.broadcast("physics_action", {
      playerId: playerId,
      shapeId: action.shapeId,
      action: {
        ...action,
        timestamp: Date.now() // Add timestamp for clients to handle synchronization
      }
    }, { 
      except: client,
      immediate: true // Use immediate flag to prioritize physics actions
    });
    
    // Update player's last activity time
    player.lastActivity = Date.now();
  }

  handleCreateShape(client) {
    // Find the player ID associated with this session
    const playerId = this.sessionIdToPlayerId.get(client.sessionId);
    
    if (!playerId) {
      // Silently ignore messages from sessions without player IDs
      // This happens when processing messages from disconnected clients
      return;
    }
    
    const player = this.state.getPlayer(playerId);
    if (!player) {
      logger.warn(`Player not found for create shape: ${playerId}`);
      return;
    }
    
    // DISABLED: Temporarily prevent creating additional shapes
    // Only allow shape creation if the player has no shapes
    if (player.shapes.length > 0) {
      logger.log(`Player ${playerId} attempted to create additional shape, but this feature is disabled`);
      return;
    }
    
    // Create a new shape for the player with a unique timestamp-based ID
    const uniqueId = `${playerId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const shape = this.state.createShapeForPlayer(playerId, uniqueId);
    
    if (shape) {
      logger.log(`Created new shape ${shape.id} for player ${playerId}`);
    }
  }

  handleRemoveShape(client, message) {
    if (!message.shapeId) {
      logger.warn(`Invalid remove shape message from ${client.sessionId}: missing shapeId`);
      return;
    }
    
    // Find the player ID associated with this session
    const playerId = this.sessionIdToPlayerId.get(client.sessionId);
    
    if (!playerId) {
      // Silently ignore messages from sessions without player IDs
      // This happens when processing messages from disconnected clients
      return;
    }
    
    const player = this.state.getPlayer(playerId);
    if (!player) {
      logger.warn(`Player not found for remove shape: ${playerId}`);
      return;
    }
    
    // Remove the shape - allow removing any shape, even if it's the last one
    player.removeShape(message.shapeId);
    logger.log(`Removed shape ${message.shapeId} for player ${playerId}`);
  }

  handleChangeBlockColor(client, message) {
    if (!message.color) {
      logger.warn(`Invalid change color message from ${client.sessionId}: missing color`);
      return;
    }
    
    // Validate color format (simple hex color validation)
    if (!/^#[0-9A-F]{6}$/i.test(message.color)) {
      logger.warn(`Invalid color format from ${client.sessionId}: ${message.color}`);
      return;
    }
    
    // Find the player ID associated with this session
    const playerId = this.sessionIdToPlayerId.get(client.sessionId);
    
    if (!playerId) {
      // Silently ignore messages from sessions without player IDs
      return;
    }
    
    const player = this.state.getPlayer(playerId);
    if (!player) {
      logger.warn(`Player not found for color change: ${playerId}`);
      return;
    }
    
    // Update color for all of the player's shapes
    if (player.shapes.length > 0) {
      player.shapes.forEach(shape => {
        shape.setColor(message.color);
      });
      
      logger.log(`Changed color to ${message.color} for player ${playerId}`);
      
      // Broadcast the color change to all clients
      this.broadcast("block_color_changed", {
        playerId: playerId,
        color: message.color
      });
    }
  }

  validateShapeData(shapeData) {
    // Basic validation of shape data
    if (!shapeData.id || typeof shapeData.id !== 'string') return false;
    if (typeof shapeData.x !== 'number') return false;
    if (typeof shapeData.y !== 'number') return false;
    if (typeof shapeData.angle !== 'number') return false;
    if (!shapeData.velocity) return false;
    if (typeof shapeData.velocity.x !== 'number') return false;
    if (typeof shapeData.velocity.y !== 'number') return false;
    
    return true;
  }

  // Add a method to check and reset shapes that fall out of bounds
  checkAndResetOutOfBoundsShapes() {
    const state = this.state;
    const boundaryWidth = state.boundaryWidth;
    const boundaryHeight = state.boundaryHeight;
    
    // Define margins for checking out of bounds
    const margin = 100;
    
    // Check all players' shapes
    state.players.forEach((player, playerId) => {
      player.shapes.forEach((shape, index) => {
        // Check if shape is out of bounds (with some margin)
        const isOutOfBounds = 
          shape.x < -margin || 
          shape.x > boundaryWidth + margin || 
          shape.y < -margin || 
          shape.y > boundaryHeight + margin;
        
        if (isOutOfBounds) {
          logger.log(`Server resetting out-of-bounds shape ${shape.id} for player ${playerId} at position (${shape.x}, ${shape.y})`);
          
          // Reset position to the bottom of the boundary
          const newX = Math.random() * (boundaryWidth - 200) + 100; // Keep away from edges
          const newY = boundaryHeight - 50; // Position just above the bottom boundary
          
          // Update the shape's position
          shape.setPosition(newX, newY, 0);
          shape.setVelocity(0, 0);
          
          // Broadcast the position change to all clients
          this.broadcast("physics_action", {
            playerId,
            shapeId: shape.id,
            action: {
              type: "position",
              x: newX,
              y: newY,
              angle: 0,
              velocity: { x: 0, y: 0 },
              timestamp: Date.now()
            }
          });
        }
      });
    });
  }

  // Update the onUpdate method to check for out-of-bounds shapes
  onUpdate(deltaTime) {
    // Check for out-of-bounds shapes every second
    this.outOfBoundsCheckCounter = (this.outOfBoundsCheckCounter || 0) + deltaTime;
    if (this.outOfBoundsCheckCounter > 1000) { // Check every 1 second
      this.checkAndResetOutOfBoundsShapes();
      this.outOfBoundsCheckCounter = 0;
    }
    
    // Clean up inactive players
    this.cleanupCounter = (this.cleanupCounter || 0) + deltaTime;
    if (this.cleanupCounter > 30000) { // Every 30 seconds
      const removed = this.state.cleanupInactivePlayers();
      if (removed > 0) {
        logger.log(`Removed ${removed} inactive players`);
      }
      this.cleanupCounter = 0;
    }
  }
}

module.exports = { PhysicsRoom }; 