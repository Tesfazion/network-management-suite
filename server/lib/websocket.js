/**
 * WebSocket Server for Real-Time Communication
 * Broadcasts monitoring events and alerts to all connected clients
 */

const WebSocket = require('ws');
const logger = require('./logger');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  /**
   * Initialize WebSocket server
   * @param {http.Server} httpServer - HTTP server instance to attach to
   */
  initialize(httpServer) {
    this.wss = new WebSocket.Server({ 
      server: httpServer,
      path: '/ws',
      perMessageDeflate: false
    });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      logger.info(`WebSocket client connected from ${clientIp}`);
      
      this.clients.add(ws);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Network Management Suite monitoring system',
        timestamp: new Date().toISOString()
      }));

      // Handle incoming messages from clients
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(ws, data);
        } catch (error) {
          logger.error('Failed to parse WebSocket message:', error);
        }
      });

      // Handle client disconnection
      ws.on('close', () => {
        logger.info(`WebSocket client disconnected from ${clientIp}`);
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send ping every 30 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });

    logger.info('WebSocket server initialized on path /ws');
  }

  /**
   * Handle messages received from clients
   */
  handleClientMessage(ws, data) {
    logger.debug('Received WebSocket message:', data);

    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;

      case 'subscribe':
        // Client subscribing to specific events (future enhancement)
        ws.send(JSON.stringify({ type: 'subscribed', events: data.events || ['all'] }));
        break;

      default:
        logger.debug(`Unknown WebSocket message type: ${data.type}`);
    }
  }

  /**
   * Broadcast message to all connected clients
   * @param {object} data - Data to broadcast
   */
  broadcast(data) {
    if (!this.wss) {
      logger.warn('Cannot broadcast: WebSocket server not initialized');
      return;
    }

    const message = JSON.stringify(data);
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          sentCount++;
        } catch (error) {
          logger.error('Failed to send WebSocket message to client:', error);
        }
      }
    });

    logger.debug(`Broadcasted message to ${sentCount} clients: ${data.type}`);
  }

  /**
   * Send message to a specific client
   * @param {WebSocket} client - Target client
   * @param {object} data - Data to send
   */
  sendToClient(client, data) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (error) {
        logger.error('Failed to send message to client:', error);
      }
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Close all connections and shutdown server
   */
  shutdown() {
    logger.info('Shutting down WebSocket server...');

    this.clients.forEach((client) => {
      try {
        client.close(1000, 'Server shutting down');
      } catch (error) {
        logger.error('Error closing WebSocket client:', error);
      }
    });

    this.clients.clear();

    if (this.wss) {
      this.wss.close(() => {
        logger.info('WebSocket server closed');
      });
    }
  }
}

// Singleton instance
const websocketServer = new WebSocketServer();

module.exports = websocketServer;
