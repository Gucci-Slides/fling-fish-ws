const { Schema, MapSchema, ArraySchema, type } = require("@colyseus/schema");
const logger = require("../lib/logger");

class Vector extends Schema {
  constructor(x = 0, y = 0) {
    super();
    this.x = x;
    this.y = y;
  }
}

type("number")(Vector.prototype, "x");
type("number")(Vector.prototype, "y");

class Shape extends Schema {
  constructor(id, x = 0, y = 0) {
    super();
    this.id = id;
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.velocity = new Vector();
    this.lastUpdate = Date.now();
    this.color = this.generateRandomColor(); // Generate a random color
  }

  setPosition(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle || this.angle;
    this.lastUpdate = Date.now();
  }

  setVelocity(x, y) {
    this.velocity.x = x;
    this.velocity.y = y;
  }
  
  setColor(color) {
    this.color = color;
    this.lastUpdate = Date.now();
  }

  // Generate a random vibrant color in hex format
  generateRandomColor() {
    // Generate vibrant colors by using high saturation and medium-high lightness in HSL
    // Then convert to hex
    const hue = Math.floor(Math.random() * 360); // Random hue (0-359)
    
    // Convert HSL to RGB, then to hex
    // Using a simplified conversion for vibrant colors
    const h = hue / 60;
    const s = 0.8; // High saturation
    const l = 0.6; // Medium-high lightness
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(h % 2 - 1));
    const m = l - c / 2;
    
    let r, g, b;
    if (h >= 0 && h < 1) { r = c; g = x; b = 0; }
    else if (h >= 1 && h < 2) { r = x; g = c; b = 0; }
    else if (h >= 2 && h < 3) { r = 0; g = c; b = x; }
    else if (h >= 3 && h < 4) { r = 0; g = x; b = c; }
    else if (h >= 4 && h < 5) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    // Convert to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
}

type("string")(Shape.prototype, "id");
type("number")(Shape.prototype, "x");
type("number")(Shape.prototype, "y");
type("number")(Shape.prototype, "angle");
type(Vector)(Shape.prototype, "velocity");
type("number")(Shape.prototype, "lastUpdate");
type("string")(Shape.prototype, "color");

class Player extends Schema {
  constructor(id) {
    super();
    this.id = id;
    this.shapes = new ArraySchema();
    this.disconnected = false;
    this.lastActivity = Date.now();
  }

  addShape(shape) {
    this.shapes.push(shape);
    this.lastActivity = Date.now();
  }

  removeShape(shapeId) {
    const index = this.shapes.findIndex(shape => shape.id === shapeId);
    if (index !== -1) {
      this.shapes.splice(index, 1);
      this.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  updateShape(shapeId, x, y, angle, velocityX, velocityY) {
    const shape = this.shapes.find(shape => shape.id === shapeId);
    if (shape) {
      shape.setPosition(x, y, angle);
      shape.setVelocity(velocityX, velocityY);
      this.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  setConnectionStatus(connected) {
    this.disconnected = !connected;
    this.lastActivity = Date.now();
  }
}

type("string")(Player.prototype, "id");
type([Shape])(Player.prototype, "shapes");
type("boolean")(Player.prototype, "disconnected");
type("number")(Player.prototype, "lastActivity");

class PhysicsState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.serverTime = Date.now();
    
    // Define standard game boundaries for all clients - increased for more space
    this.boundaryWidth = 2400;
    this.boundaryHeight = 1800;

    // Update server time every second
    setInterval(() => {
      this.serverTime = Date.now();
    }, 1000);
  }

  createPlayer(playerId) {
    if (this.players.has(playerId)) {
      logger.warn(`Player ${playerId} already exists`);
      return this.players.get(playerId);
    }

    const player = new Player(playerId);
    this.players.set(playerId, player);
    return player;
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  removePlayer(playerId) {
    if (this.players.has(playerId)) {
      this.players.delete(playerId);
      return true;
    }
    return false;
  }

  markPlayerConnected(playerId, connected) {
    const player = this.players.get(playerId);
    if (player) {
      player.setConnectionStatus(connected);
      logger.log(`Player ${playerId} connection status set to ${connected ? 'connected' : 'disconnected'}`);
      return true;
    }
    logger.warn(`Cannot mark player ${playerId} as ${connected ? 'connected' : 'disconnected'}: player not found`);
    return false;
  }

  createShapeForPlayer(playerId, customShapeId = null) {
    const player = this.players.get(playerId);
    if (!player) {
      logger.warn(`Cannot create shape: player ${playerId} not found`);
      return null;
    }

    // Generate a unique ID for the shape or use the provided custom ID
    const shapeId = customShapeId || `${playerId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Create a shape at the bottom of the boundary
    // Position it randomly along the x-axis, but just above the bottom boundary
    const x = Math.random() * (this.boundaryWidth - 100) + 50; // Keep away from the edges
    const y = this.boundaryHeight - 50; // Position just above the bottom boundary
    
    const shape = new Shape(shapeId, x, y);
    
    player.addShape(shape);
    return shape;
  }

  getConnectedPlayerCount() {
    let count = 0;
    this.players.forEach(player => {
      if (!player.disconnected) {
        count++;
      }
    });
    return count;
  }

  getDisconnectedPlayerCount() {
    let count = 0;
    this.players.forEach(player => {
      if (player.disconnected) {
        count++;
      }
    });
    return count;
  }

  getPlayerSummary() {
    const summary = [];
    this.players.forEach((player, id) => {
      summary.push({
        id,
        shapeCount: player.shapes.length,
        disconnected: player.disconnected,
        lastActivity: player.lastActivity
      });
    });
    return summary;
  }

  cleanupInactivePlayers(maxInactiveTime = 300000) { // 5 minutes by default
    const now = Date.now();
    const playersToRemove = [];
    
    this.players.forEach((player, id) => {
      if (player.disconnected && (now - player.lastActivity > maxInactiveTime)) {
        playersToRemove.push(id);
      }
    });
    
    playersToRemove.forEach(id => {
      logger.log(`Removing inactive player ${id} (inactive for ${Math.floor((now - this.players.get(id).lastActivity) / 1000)} seconds)`);
      this.removePlayer(id);
    });
    
    return playersToRemove.length;
  }
}

type("number")(PhysicsState.prototype, "serverTime");
type({ map: Player })(PhysicsState.prototype, "players");
// Add type definition for boundaries as individual properties
type("number")(PhysicsState.prototype, "boundaryWidth");
type("number")(PhysicsState.prototype, "boundaryHeight");

module.exports = { Vector, Shape, Player, PhysicsState }; 