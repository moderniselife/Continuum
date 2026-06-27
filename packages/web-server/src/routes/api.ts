import { Router, type Request, type Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "js-yaml";

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
// Helpers — locate the Continue global directory
// ============================================================

/** Returns the Continue global directory (~/.continue by default). */
function getContinueDir(): string {
  return (
    process.env.CONTINUE_GLOBAL_DIR ?? path.join(os.homedir(), ".continue")
  );
}

/** Returns the sessions directory inside the Continue global dir. */
function getSessionsDir(): string {
  return path.join(getContinueDir(), "sessions");
}

/** Returns the path to the config file (YAML preferred, JSON fallback). */
function getConfigPath(): string {
  const dir = getContinueDir();
  const yamlPath = path.join(dir, "config.yaml");
  const jsonPath = path.join(dir, "config.json");
  if (fs.existsSync(yamlPath)) return yamlPath;
  if (fs.existsSync(jsonPath)) return jsonPath;
  return yamlPath; // default
}

/** Read and parse config (supports both YAML and JSON). */
function readConfig(): Record<string, unknown> {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};

  const content = fs.readFileSync(configPath, "utf-8");
  if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
    return (yaml.load(content) as Record<string, unknown>) ?? {};
  }
  return JSON.parse(content);
}

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
router.get("/sessions", (_req: Request, res: Response) => {
  try {
    const sessionsDir = getSessionsDir();
    if (!fs.existsSync(sessionsDir)) {
      res.json({ sessions: [], total: 0, offset: 0, limit: 50 });
      return;
    }

    // Read the sessions.json index file for metadata (dateCreated, etc.)
    // that isn't stored in the individual session files.
    const indexPath = path.join(sessionsDir, "sessions.json");
    let indexMap = new Map<
      string,
      { dateCreated?: string; messageCount?: number }
    >();
    if (fs.existsSync(indexPath)) {
      try {
        const indexData = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        if (Array.isArray(indexData)) {
          for (const entry of indexData) {
            if (entry.sessionId) {
              indexMap.set(entry.sessionId, {
                dateCreated: entry.dateCreated,
                messageCount: entry.messageCount,
              });
            }
          }
        }
      } catch {
        // Index file is malformed — continue without it.
      }
    }

    const files = fs
      .readdirSync(sessionsDir)
      .filter((f) => {
        // Only include UUID-style session files, skip sessions.json metadata
        return f.endsWith(".json") && f !== "sessions.json";
      })
      .sort((a, b) => {
        const aPath = path.join(sessionsDir, a);
        const bPath = path.join(sessionsDir, b);
        return fs.statSync(bPath).mtimeMs - fs.statSync(aPath).mtimeMs;
      });

    const sessions = files.map((file) => {
      const filePath = path.join(sessionsDir, file);
      const sessionId = path.basename(file, ".json");
      const indexEntry = indexMap.get(sessionId);

      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const historyLen = Array.isArray(data.history)
          ? data.history.length
          : 0;

        // dateCreated is in the index file as a ms-since-epoch string
        const dateCreatedMs = data.dateCreated ?? indexEntry?.dateCreated;
        const createdAt = dateCreatedMs
          ? new Date(Number(dateCreatedMs)).toISOString()
          : null;

        return {
          id: data.sessionId ?? sessionId,
          title:
            data.title && data.title !== ""
              ? data.title
              : `Session ${sessionId.slice(0, 8)}`,
          createdAt,
          lastModified: fs.statSync(filePath).mtime.toISOString(),
          messageCount: historyLen,
          mode: data.mode ?? "chat",
          workspaceDirectory: data.workspaceDirectory ?? null,
          chatModelTitle: data.chatModelTitle ?? null,
        };
      } catch {
        return {
          id: sessionId,
          title: `Session ${sessionId.slice(0, 8)}`,
          createdAt: indexEntry?.dateCreated
            ? new Date(Number(indexEntry.dateCreated)).toISOString()
            : null,
          lastModified: fs.statSync(filePath).mtime.toISOString(),
          messageCount: 0,
          mode: "chat",
          workspaceDirectory: null,
          chatModelTitle: null,
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

    // Normalise the session data into a consistent format.
    // Continue stores history items as { message: { role, content, id }, contextItems, ... }
    // where content can be a plain string OR an array of parts:
    //   [{type: "text", text: "..."}, {type: "imageUrl", imageUrl: "..."}]
    const history = Array.isArray(data.history) ? data.history : [];
    const messages = history.map(
      (
        item: {
          role?: string;
          content?: unknown;
          message?: { role?: string; content?: unknown; id?: string };
        },
        idx: number,
      ) => {
        const msg = item.message ?? item;
        const rawContent = msg.content ?? "";

        // Flatten multi-part content to a string
        let content: string;
        if (typeof rawContent === "string") {
          content = rawContent;
        } else if (Array.isArray(rawContent)) {
          content = rawContent
            .map(
              (part: { type?: string; text?: string; imageUrl?: string }) => {
                if (part.type === "text") return part.text ?? "";
                if (part.type === "imageUrl")
                  return part.imageUrl ? `![image](${part.imageUrl})` : "";
                return JSON.stringify(part);
              },
            )
            .join("\n");
        } else {
          content = String(rawContent);
        }

        return {
          id: msg.id ?? `msg-${idx}`,
          role: msg.role ?? item.role ?? "user",
          content,
          createdAt: data.dateCreated
            ? new Date(Number(data.dateCreated) + idx * 1000).toISOString()
            : new Date().toISOString(),
        };
      },
    );

    res.json({
      id: data.sessionId ?? req.params.id,
      title: data.title ?? "Untitled Session",
      messages,
      createdAt: data.dateCreated
        ? new Date(Number(data.dateCreated)).toISOString()
        : null,
      lastModified: fs.statSync(filePath).mtime.toISOString(),
      messageCount: messages.length,
      mode: data.mode ?? "chat",
      workspaceDirectory: data.workspaceDirectory ?? null,
    });
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
router.get("/config", (_req: Request, res: Response) => {
  try {
    const config = readConfig();
    res.json(config);
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
// Models (reads from config — supports YAML and JSON)
// ============================================================
router.get("/models", (_req: Request, res: Response) => {
  try {
    const config = readConfig();
    const rawModels = (config.models as Record<string, unknown>[]) ?? [];

    // Normalise each model into a consistent shape the frontend expects
    const models = rawModels.map((m: Record<string, unknown>, idx: number) => ({
      id: (m.model as string) ?? (m.id as string) ?? `model-${idx}`,
      name:
        (m.name as string) ??
        (m.title as string) ??
        (m.model as string) ??
        `Model ${idx + 1}`,
      provider: (m.provider as string) ?? "unknown",
      model: (m.model as string) ?? "",
      roles: (m.roles as string[]) ?? [],
    }));

    res.json({ models });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================
// Chat (POST — used for API integrations)
// ============================================================
router.post("/chat", (req: Request, res: Response) => {
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
