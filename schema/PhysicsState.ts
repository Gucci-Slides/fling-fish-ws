import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Vector extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

export class Shape extends Schema {
  @type("string") id: string;
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") angle: number = 0;
  @type(Vector) velocity = new Vector();
  @type("number") lastUpdate: number = 0;

  constructor(id?: string, x?: number, y?: number) {
    super();
    this.id = id || Math.random().toString(36).substring(2, 9);
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
    this.lastUpdate = Date.now();
  }

  setPosition(x: number, y: number, angle?: number) {
    this.x = x;
    this.y = y;
    if (angle !== undefined) {
      this.angle = angle;
    }
    this.lastUpdate = Date.now();
  }

  setVelocity(x: number, y: number) {
    this.velocity.x = x;
    this.velocity.y = y;
  }
}

export class Player extends Schema {
  @type("string") id: string;
  @type([Shape]) shapes = new ArraySchema<Shape>();
  @type("boolean") disconnected: boolean = false;

  constructor(id: string) {
    super();
    this.id = id;
  }

  addShape(shape: Shape) {
    this.shapes.push(shape);
  }

  removeShape(shapeId: string) {
    const index = this.shapes.findIndex(s => s.id === shapeId);
    if (index >= 0) {
      this.shapes.splice(index, 1);
    }
  }

  updateShape(shapeId: string, x: number, y: number, angle?: number, velocityX?: number, velocityY?: number) {
    const shape = this.shapes.find(s => s.id === shapeId);
    if (shape) {
      shape.setPosition(x, y, angle);
      if (velocityX !== undefined && velocityY !== undefined) {
        shape.setVelocity(velocityX, velocityY);
      }
    }
  }
}

export class PhysicsState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type("number") serverTime: number = 0;

  constructor() {
    super();
    // Update server time periodically
    setInterval(() => {
      this.serverTime = Date.now();
    }, 1000);
  }

  createPlayer(id: string): Player {
    const player = new Player(id);
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string) {
    this.players.delete(id);
  }

  getPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }

  createShapeForPlayer(playerId: string, x?: number, y?: number): Shape | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    const shape = new Shape(
      undefined,
      x !== undefined ? x : Math.random() * 800 + 100,
      y !== undefined ? y : Math.random() * 400 + 100
    );
    
    player.addShape(shape);
    return shape;
  }

  updatePlayerShape(playerId: string, shapeId: string, x: number, y: number, angle?: number, velocityX?: number, velocityY?: number) {
    const player = this.players.get(playerId);
    if (player) {
      player.updateShape(shapeId, x, y, angle, velocityX, velocityY);
    }
  }

  markPlayerConnected(id: string, connected: boolean = true) {
    const player = this.players.get(id);
    if (player) {
      player.disconnected = !connected;
    }
  }
} 