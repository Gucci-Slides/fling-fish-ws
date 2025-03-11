import { Room, Client } from "colyseus";
import { PhysicsState, Shape } from "../schema/PhysicsState";
import { logger } from "../../lib/logger";

export class PhysicsRoom extends Room<PhysicsState> {
  // Physics simulation settings
  private readonly SIMULATION_INTERVAL_MS = 16; // ~60 fps
  private readonly MAX_SHAPES_PER_PLAYER = 5;

  onCreate(options: any) {
    logger.log("PhysicsRoom created!", options);
    
    // Initialize the room state
    this.setState(new PhysicsState());
    
    // Set up physics simulation interval
    this.setSimulationInterval(() => this.update());
    
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
    
    logger.log("PhysicsRoom initialized with simulation interval:", this.SIMULATION_INTERVAL_MS);
  }

  onJoin(client: Client, options: any = {}) {
    logger.log(`Client joined: ${client.sessionId}`, options);
    
    // Create a new player
    const player = this.state.createPlayer(client.sessionId);
    
    // Create initial shape for the player
    const initialShape = this.state.createShapeForPlayer(client.sessionId);
    
    logger.log(`Created player ${client.sessionId} with initial shape ${initialShape?.id}`);
  }

  onLeave(client: Client, consented: boolean) {
    logger.log(`Client left: ${client.sessionId} (consented: ${consented})`);
    
    // Mark player as disconnected but don't remove immediately
    // This allows reconnection and lets other players still see their shapes
    this.state.markPlayerConnected(client.sessionId, false);
    
    // Set up a delayed cleanup
    this.clock.setTimeout(() => {
      // If the player hasn't reconnected after 60 seconds, remove them
      const player = this.state.getPlayer(client.sessionId);
      if (player && player.disconnected) {
        logger.log(`Removing disconnected player: ${client.sessionId}`);
        this.state.removePlayer(client.sessionId);
      }
    }, 60000);
  }

  update() {
    // This is where we would update physics if we were running a full simulation on the server
    // For now, we'll just rely on client updates and validate them
    
    // Update server time
    this.state.serverTime = Date.now();
  }

  handleShapeUpdate(client: Client, message: any) {
    if (!message.shapes || !Array.isArray(message.shapes)) {
      logger.warn(`Invalid shape update from ${client.sessionId}: missing shapes array`);
      return;
    }
    
    const player = this.state.getPlayer(client.sessionId);
    if (!player) {
      logger.warn(`Player not found for shape update: ${client.sessionId}`);
      return;
    }
    
    // Process each shape update
    message.shapes.forEach((shapeData: any) => {
      if (!this.validateShapeData(shapeData)) {
        logger.warn(`Invalid shape data from ${client.sessionId}:`, shapeData);
        return;
      }
      
      // Find the shape in the player's shapes
      const existingShape = player.shapes.find((s: Shape) => s.id === shapeData.id);
      
      if (existingShape) {
        // Update existing shape
        existingShape.setPosition(shapeData.x, shapeData.y, shapeData.angle);
        existingShape.setVelocity(shapeData.velocity.x, shapeData.velocity.y);
      } else {
        // This is a new shape, validate that the player doesn't exceed the limit
        if (player.shapes.length >= this.MAX_SHAPES_PER_PLAYER) {
          logger.warn(`Player ${client.sessionId} exceeded max shapes limit`);
          return;
        }
        
        // Create a new shape
        const newShape = new Shape(shapeData.id, shapeData.x, shapeData.y);
        newShape.angle = shapeData.angle || 0;
        newShape.setVelocity(shapeData.velocity?.x || 0, shapeData.velocity?.y || 0);
        
        player.addShape(newShape);
        logger.log(`Added new shape ${newShape.id} for player ${client.sessionId}`);
      }
    });
  }

  handlePhysicsAction(client: Client, message: any) {
    if (!message.action || !message.action.type || !message.action.shapeId) {
      logger.warn(`Invalid physics action from ${client.sessionId}:`, message);
      return;
    }
    
    const player = this.state.getPlayer(client.sessionId);
    if (!player) {
      logger.warn(`Player not found for physics action: ${client.sessionId}`);
      return;
    }
    
    const { action } = message;
    const shape = player.shapes.find((s: Shape) => s.id === action.shapeId);
    
    if (!shape) {
      logger.warn(`Shape not found for physics action: ${action.shapeId}`);
      return;
    }
    
    // Handle different action types
    switch (action.type) {
      case 'position':
        if (typeof action.x !== 'number' || typeof action.y !== 'number') {
          logger.warn(`Invalid position data in physics action from ${client.sessionId}`);
          return;
        }
        
        shape.setPosition(action.x, action.y, action.angle);
        
        if (action.velocity) {
          shape.setVelocity(action.velocity.x, action.velocity.y);
        }
        break;
        
      case 'impulse':
        if (!action.velocity || typeof action.velocity.x !== 'number' || typeof action.velocity.y !== 'number') {
          logger.warn(`Invalid velocity data in physics action from ${client.sessionId}`);
          return;
        }
        
        shape.setVelocity(action.velocity.x, action.velocity.y);
        break;
        
      default:
        logger.warn(`Unknown physics action type: ${action.type}`);
    }
    
    // Broadcast the action to other clients
    this.broadcast("physics_action", {
      playerId: client.sessionId,
      shapeId: action.shapeId,
      action
    }, { except: client });
  }

  handleCreateShape(client: Client) {
    const player = this.state.getPlayer(client.sessionId);
    if (!player) {
      logger.warn(`Player not found for create shape: ${client.sessionId}`);
      return;
    }
    
    // Check if player has reached the maximum number of shapes
    if (player.shapes.length >= this.MAX_SHAPES_PER_PLAYER) {
      logger.warn(`Player ${client.sessionId} attempted to exceed max shapes limit`);
      return;
    }
    
    // Create a new shape for the player
    const shape = this.state.createShapeForPlayer(client.sessionId);
    
    if (shape) {
      logger.log(`Created new shape ${shape.id} for player ${client.sessionId}`);
    }
  }

  handleRemoveShape(client: Client, message: any) {
    if (!message.shapeId) {
      logger.warn(`Invalid remove shape message from ${client.sessionId}: missing shapeId`);
      return;
    }
    
    const player = this.state.getPlayer(client.sessionId);
    if (!player) {
      logger.warn(`Player not found for remove shape: ${client.sessionId}`);
      return;
    }
    
    // Ensure player has at least one shape remaining
    if (player.shapes.length <= 1) {
      logger.warn(`Player ${client.sessionId} attempted to remove their last shape`);
      return;
    }
    
    // Remove the shape
    player.removeShape(message.shapeId);
    logger.log(`Removed shape ${message.shapeId} for player ${client.sessionId}`);
  }

  validateShapeData(shapeData: any): boolean {
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
} 