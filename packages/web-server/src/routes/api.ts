import { Router, type Request, type Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * REST API routes for the Continuum Web Server.
 *
 * Provides endpoints for:
 * - Chat sessions (CRUD + history)
 * - Configuration management
 * - Model listing
 * - Health checks
 */

const router = Router();

// ============================================================
// Health
// ============================================================
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    uptime: process.uptime(),
  });
});

// ============================================================
// Sessions / History
// ============================================================
function getSessionsDir(): string {
  const continuumDir =
    process.env.CONTINUUM_GLOBAL_DIR ?? path.join(os.homedir(), ".continuum");
  return path.join(continuumDir, "sessions");
}

router.get("/sessions", (_req: Request, res: Response) => {
  try {
    const sessionsDir = getSessionsDir();
    if (!fs.existsSync(sessionsDir)) {
      res.json({ sessions: [] });
      return;
    }

    const files = fs
      .readdirSync(sessionsDir)
      .filter((f) => f.endsWith(".json"))
      .sort((a, b) => {
        // Sort by modification time, newest first
        const aPath = path.join(sessionsDir, a);
        const bPath = path.join(sessionsDir, b);
        return fs.statSync(bPath).mtimeMs - fs.statSync(aPath).mtimeMs;
      });

    const sessions = files.map((file) => {
      const filePath = path.join(sessionsDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        return {
          id: path.basename(file, ".json"),
          title: data.title ?? "Untitled Session",
          createdAt: data.dateCreated,
          lastModified: fs.statSync(filePath).mtime.toISOString(),
          messageCount: data.history?.length ?? 0,
        };
      } catch {
        return {
          id: path.basename(file, ".json"),
          title: "Untitled Session",
          createdAt: null,
          lastModified: fs.statSync(filePath).mtime.toISOString(),
          messageCount: 0,
        };
      }
    });

    const offset = parseInt((_req.query.offset as string) ?? "0", 10);
    const limit = parseInt((_req.query.limit as string) ?? "50", 10);

    res.json({
      sessions: sessions.slice(offset, offset + limit),
      total: sessions.length,
      offset,
      limit,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get("/sessions/:id", (req: Request, res: Response) => {
  try {
    const sessionsDir = getSessionsDir();
    const filePath = path.join(sessionsDir, `${req.params.id}.json`);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete("/sessions/:id", (req: Request, res: Response) => {
  try {
    const sessionsDir = getSessionsDir();
    const filePath = path.join(sessionsDir, `${req.params.id}.json`);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    fs.unlinkSync(filePath);
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================
// Configuration
// ============================================================
function getConfigPath(): string {
  const continuumDir =
    process.env.CONTINUUM_GLOBAL_DIR ?? path.join(os.homedir(), ".continuum");
  return path.join(continuumDir, "config.yaml");
}

router.get("/config", (_req: Request, res: Response) => {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      // Try config.json fallback
      const jsonPath = configPath.replace(".yaml", ".json");
      if (fs.existsSync(jsonPath)) {
        const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        res.json(data);
        return;
      }
      res.json({});
      return;
    }

    const content = fs.readFileSync(configPath, "utf-8");
    res.type("text/yaml").send(content);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put("/config", (req: Request, res: Response) => {
  try {
    const configPath = getConfigPath();
    const content =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body, null, 2);
    fs.writeFileSync(configPath, content, "utf-8");
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================
// Models (reads from config)
// ============================================================
router.get("/models", (_req: Request, res: Response) => {
  try {
    const configPath = getConfigPath().replace(".yaml", ".json");
    if (!fs.existsSync(configPath)) {
      res.json({ models: [] });
      return;
    }

    const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    res.json({ models: data.models ?? [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================
// Chat (POST — used for API integrations)
// ============================================================
router.post("/chat", (req: Request, res: Response) => {
  // Chat via REST requires a connected WebSocket session.
  // This endpoint delegates to the WebSocket handler for streaming.
  // For now, return instructions on how to use the WebSocket.
  res.status(501).json({
    error: "Chat via REST is not yet implemented",
    hint: "Connect to the WebSocket at /ws for real-time chat. REST chat with SSE streaming is coming soon.",
    websocketUrl: `ws://${req.headers.host}/ws`,
  });
});

// ============================================================
// Tools
// ============================================================
router.get("/tools", (_req: Request, res: Response) => {
  // TODO: Wire up to Core's tool registry
  res.json({
    tools: [],
    message:
      "Tool listing will be available once the Core engine is connected.",
  });
});

export default router;
