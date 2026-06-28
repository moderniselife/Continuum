import express from "express";
import cors from "cors";
import helmet from "helmet";
import * as path from "path";
import * as fs from "fs";
import { createServer } from "http";

import { authMiddleware, isAuthEnabled } from "./auth/middleware.js";
import apiRoutes from "./routes/api.js";
import { createFileRoutes } from "./routes/files.js";
import {
  createTerminalRoutes,
  handleTerminalMessage,
  attachTerminalOutput,
} from "./routes/terminal.js";
import { WebSocketHandler } from "./ws/handler.js";
import { CoreManager } from "./ws/CoreManager.js";
import { WebIDE } from "./ide/WebIDE.js";

export interface ServerOptions {
  port: number;
  host: string;
  workspaceDirs: string[];
  guiDistPath?: string;
  corsOrigins?: string[];
}

/**
 * Creates and configures the Continuum Web Server.
 *
 * @returns An object with the HTTP server, Express app, and WebSocket handler.
 */
export function createContinuumServer(options: ServerOptions) {
  const app = express();

  // ============================================================
  // Middleware
  // ============================================================
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabled for GUI WebSocket connections
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: options.corsOrigins ?? true,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "50mb" }));
  app.use(express.text({ type: "text/yaml" }));

  // Auth middleware
  app.use(authMiddleware);

  // ============================================================
  // Shared WebIDE Instance
  // ============================================================
  const webIde = new WebIDE(options.workspaceDirs);

  // ============================================================
  // API Routes
  // ============================================================
  app.use("/api/v1", apiRoutes);
  app.use("/api/v1", createFileRoutes(webIde));
  app.use("/api/v1", createTerminalRoutes());

  // ============================================================
  // Static GUI Serving
  // ============================================================
  const guiDistPath =
    options.guiDistPath ??
    // Check for web build output first, then fall back to gui/dist
    (fs.existsSync(path.resolve(__dirname, "../public"))
      ? path.resolve(__dirname, "../public")
      : path.resolve(__dirname, "../../gui/dist"));

  if (fs.existsSync(guiDistPath)) {
    app.use(express.static(guiDistPath));

    // SPA fallback — serve index.html for all non-API routes
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.sendFile(path.join(guiDistPath, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.json({
        name: "Continuum Web Server",
        version: "0.1.0",
        status: "running",
        gui: "not built — run 'npm run build' in gui/ first",
        api: "/api/v1",
        websocket: "/ws",
        docs: {
          health: "GET /api/v1/health",
          sessions: "GET /api/v1/sessions",
          config: "GET /api/v1/config",
          models: "GET /api/v1/models",
        },
      });
    });
  }

  // ============================================================
  // HTTP + WebSocket Server + Core Engine
  // ============================================================
  const httpServer = createServer(app);
  const wsHandler = new WebSocketHandler(httpServer);
  const coreManager = new CoreManager(webIde);

  // Wire Core to each WebSocket connection
  wsHandler.onConnection(async (conn) => {
    try {
      await coreManager.createCore(conn);

      // Handle terminal WebSocket messages for this connection
      conn.ws.on("message", (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (
            typeof msg.messageType === "string" &&
            msg.messageType.startsWith("terminal/")
          ) {
            handleTerminalMessage(conn.ws, msg.messageType, msg.data ?? {});

            // Auto-attach output when a terminal/attach message arrives
            if (msg.messageType === "terminal/attach" && msg.data?.sessionId) {
              attachTerminalOutput(conn.ws, msg.data.sessionId);
            }
          }
        } catch {
          // Non-JSON or non-terminal message — handled elsewhere
        }
      });
    } catch (error) {
      console.error(`[Server] Failed to create Core for ${conn.id}:`, error);
    }
  });

  wsHandler.onDisconnection((id) => {
    coreManager.removeCore(id);
  });

  return { app, httpServer, wsHandler, coreManager, webIde };
}
