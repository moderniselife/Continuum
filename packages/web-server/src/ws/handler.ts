import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";

import { validateWebSocketAuth } from "../auth/middleware.js";

export interface WebSocketConnection {
  id: string;
  ws: WebSocket;
  connectedAt: Date;
}

/**
 * Manages WebSocket connections for the Continuum Web Server.
 *
 * Each WebSocket connection represents a client session (browser GUI or API consumer).
 * The handler:
 * - Validates authentication on upgrade
 * - Tracks active connections
 * - Routes messages to/from Core via WebMessenger
 * - Handles connection lifecycle (connect, disconnect, heartbeat)
 */
export class WebSocketHandler {
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocketConnection>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private onConnectionCallbacks: ((conn: WebSocketConnection) => void)[] = [];
  private onDisconnectionCallbacks: ((id: string) => void)[] = [];

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    // Handle upgrade requests with auth validation
    server.on("upgrade", (request: IncomingMessage, socket, head) => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

      // Only handle /ws path
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }

      // Validate authentication
      const authResult = validateWebSocketAuth(request as any);
      if (!authResult.valid) {
        socket.write("HTTP/1.1 401 Unauthorised\r\n\r\n");
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit("connection", ws, request);
      });
    });

    this.wss.on("connection", (ws: WebSocket, _request: IncomingMessage) => {
      const id = crypto.randomUUID();
      const conn: WebSocketConnection = {
        id,
        ws,
        connectedAt: new Date(),
      };

      this.connections.set(id, conn);
      console.log(
        `[WS] Client connected: ${id} (${this.connections.size} total)`,
      );

      // Notify connection listeners
      for (const cb of this.onConnectionCallbacks) {
        cb(conn);
      }

      // Send welcome message
      ws.send(
        JSON.stringify({
          messageType: "connected",
          messageId: id,
          data: {
            connectionId: id,
            serverVersion: "0.1.0",
            timestamp: new Date().toISOString(),
          },
        }),
      );

      // Handle pong for heartbeat
      (ws as any).isAlive = true;
      ws.on("pong", () => {
        (ws as any).isAlive = true;
      });

      ws.on("close", () => {
        this.connections.delete(id);
        console.log(
          `[WS] Client disconnected: ${id} (${this.connections.size} remaining)`,
        );
        for (const cb of this.onDisconnectionCallbacks) {
          cb(id);
        }
      });

      ws.on("error", (error) => {
        console.error(`[WS] Error on connection ${id}:`, error);
      });
    });

    // Start heartbeat to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) {
          ws.terminate();
          return;
        }
        (ws as any).isAlive = false;
        ws.ping();
      });
    }, 30_000);
  }

  /**
   * Register a callback for new WebSocket connections.
   */
  onConnection(callback: (conn: WebSocketConnection) => void): void {
    this.onConnectionCallbacks.push(callback);
  }

  /**
   * Register a callback for WebSocket disconnections.
   */
  onDisconnection(callback: (id: string) => void): void {
    this.onDisconnectionCallbacks.push(callback);
  }

  /**
   * Get all active connections.
   */
  getConnections(): Map<string, WebSocketConnection> {
    return this.connections;
  }

  /**
   * Broadcast a message to all connected clients.
   */
  broadcast(message: object): void {
    const data = JSON.stringify(message);
    for (const conn of this.connections.values()) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(data);
      }
    }
  }

  /**
   * Shut down the WebSocket server.
   */
  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.close();
  }
}
