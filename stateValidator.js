const MAX_VELOCITY = 50;
const MAX_POSITION_CHANGE = 100;
const PHYSICS_TICK_RATE = 60;

class StateValidator {
  constructor() {
    this.playerStates = new Map();
    this.lastUpdateTime = new Map();
  }

  validateUpdate(playerId, shapes) {
    const now = Date.now();
    const lastUpdate = this.lastUpdateTime.get(playerId) || now;
    const deltaTime = (now - lastUpdate) / 1000; // Convert to seconds
    
    // Get previous state
    const prevShapes = this.playerStates.get(playerId);
    
    // Validate each shape
    const validatedShapes = shapes.map(shape => {
      const prevShape = prevShapes?.find(s => s.id === shape.id);
      
      if (!prevShape) {
        // New shape, accept initial state
        return shape;
      }
      
      // Validate velocity
      const velocity = {
        x: Math.min(Math.max(shape.velocity.x, -MAX_VELOCITY), MAX_VELOCITY),
        y: Math.min(Math.max(shape.velocity.y, -MAX_VELOCITY), MAX_VELOCITY)
      };
      
      // Calculate maximum allowed position change
      const maxDelta = MAX_POSITION_CHANGE * deltaTime;
      
      // Validate position change
      const dx = shape.x - prevShape.x;
      const dy = shape.y - prevShape.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > maxDelta) {
        // Position change too large, interpolate back
        const scale = maxDelta / distance;
        return {
          ...shape,
          x: prevShape.x + dx * scale,
          y: prevShape.y + dy * scale,
          velocity
        };
      }
      
      return {
        ...shape,
        velocity
      };
    });
    
    // Update stored state
    this.playerStates.set(playerId, validatedShapes);
    this.lastUpdateTime.set(playerId, now);
    
    return validatedShapes;
  }

  removePlayer(playerId) {
    this.playerStates.delete(playerId);
    this.lastUpdateTime.delete(playerId);
  }
}

module.exports = new StateValidator(); 