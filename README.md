# Fling Fish WebSocket Server

This is the WebSocket server for the Fling Fish physics game. It uses Colyseus to handle real-time multiplayer physics interactions.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```

## Deployment

This server is designed to be deployed on Render.com as a Web Service.

### Deployment Steps on Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Configure the service:
   - **Name**: fling-fish-ws
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `NODE_ENV`: production
     - `PORT`: 10000 (or let Render assign one)

4. Deploy the service

## Environment Variables

- `PORT`: The port the server will listen on (default: 3002)
- `NODE_ENV`: The environment (development/production)

## API Endpoints

- `/health`: Health check endpoint that returns 200 OK

## WebSocket Endpoints

- `/`: The main WebSocket endpoint for the Colyseus server
