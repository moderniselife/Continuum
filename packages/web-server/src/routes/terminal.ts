import { Router, type Request, type Response } from "express";
import { spawn, type ChildProcess } from "child_process";
import * as os from "os";
import type { WebSocket } from "ws";

/**
 * Represents an active terminal session with a spawned shell process.
 */
interface TerminalSession {
  /** Unique session identifier. */
  id: string;
  /** The spawned shell child process. */
  process: ChildProcess;
  /** Working directory the terminal was started in. */
  cwd: string;
  /** Timestamp when the session was created. */
  createdAt: Date;
  /** Current terminal dimensions. */
  cols: number;
  rows: number;
}

/**
 * Map of active terminal sessions keyed by session ID.
 * Shared across all connections — sessions persist until explicitly killed.
 */
const activeSessions = new Map<string, TerminalSession>();

/**
 * Determines the default shell for the current platform.
 *
 * @returns The shell executable path.
 */
function getDefaultShell(): string {
  if (os.platform() === "win32") {
    return process.env.COMSPEC ?? "cmd.exe";
  }
  return process.env.SHELL ?? "/bin/zsh";
}

/**
 * Cleans up a terminal session by killing the process and removing
 * it from the active sessions map.
 *
 * @param sessionId - The session ID to clean up.
 */
function cleanupSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    try {
      session.process.kill("SIGTERM");
    } catch {
      // Process may already be dead — that's fine
    }
    activeSessions.delete(sessionId);
    console.log(`[Terminal] Session ${sessionId} cleaned up`);
  }
}

/**
 * Clean up all terminal sessions on process exit.
 */
function cleanupAllSessions(): void {
  for (const [sessionId] of activeSessions) {
    cleanupSession(sessionId);
  }
}

// Register cleanup handlers for graceful shutdown
process.on("exit", cleanupAllSessions);
process.on("SIGINT", () => {
  cleanupAllSessions();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupAllSessions();
  process.exit(0);
});

/**
 * Creates Express router routes for terminal session management.
 *
 * Terminal sessions are created via REST endpoints, but actual I/O
 * (input, output, resize) flows through WebSocket messages.
 *
 * @returns An Express Router with terminal management endpoints.
 */
export function createTerminalRoutes(): Router {
  const router = Router();

  /**
   * POST /terminal/create
   * Creates a new terminal session with an interactive shell.
   * Body: `{ cwd?: string }`
   * Returns: `{ sessionId, cwd }`
   */
  router.post("/terminal/create", (req: Request, res: Response) => {
    try {
      const { cwd } = req.body as { cwd?: string };
      const workingDir = cwd ?? process.cwd();
      const sessionId = crypto.randomUUID();
      const shell = getDefaultShell();

      const child = spawn(shell, [], {
        cwd: workingDir,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const session: TerminalSession = {
        id: sessionId,
        process: child,
        cwd: workingDir,
        createdAt: new Date(),
        cols: 80,
        rows: 24,
      };

      activeSessions.set(sessionId, session);

      // Clean up on process exit
      child.on("exit", (code, signal) => {
        console.log(
          `[Terminal] Session ${sessionId} exited (code: ${code}, signal: ${signal})`,
        );
        activeSessions.delete(sessionId);
      });

      child.on("error", (error) => {
        console.error(`[Terminal] Session ${sessionId} error:`, error);
        activeSessions.delete(sessionId);
      });

      console.log(
        `[Terminal] Created session ${sessionId} (shell: ${shell}, cwd: ${workingDir})`,
      );

      res.status(201).json({
        sessionId,
        cwd: workingDir,
        shell,
        cols: session.cols,
        rows: session.rows,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to create terminal session",
        details: (error as Error).message,
      });
    }
  });

  /**
   * DELETE /terminal/:sessionId
   * Kills a terminal session and cleans up resources.
   */
  router.delete("/terminal/:sessionId", (req: Request, res: Response) => {
    try {
      const sessionId = req.params.sessionId as string;

      if (!activeSessions.has(sessionId)) {
        res.status(404).json({ error: "Terminal session not found" });
        return;
      }

      cleanupSession(sessionId);
      res.json({ killed: true, sessionId });
    } catch (error) {
      res.status(500).json({
        error: "Failed to kill terminal session",
        details: (error as Error).message,
      });
    }
  });

  /**
   * GET /terminal/sessions
   * Lists all active terminal sessions.
   */
  router.get("/terminal/sessions", (_req: Request, res: Response) => {
    try {
      const sessions = Array.from(activeSessions.values()).map((session) => ({
        id: session.id,
        cwd: session.cwd,
        createdAt: session.createdAt.toISOString(),
        cols: session.cols,
        rows: session.rows,
        pid: session.process.pid,
      }));

      res.json({ sessions, total: sessions.length });
    } catch (error) {
      res.status(500).json({
        error: "Failed to list terminal sessions",
        details: (error as Error).message,
      });
    }
  });

  return router;
}

/**
 * Handles terminal-related WebSocket messages for a given connection.
 *
 * Supports the following message types:
 * - `terminal/input` — Client sends keystrokes to a terminal session
 * - `terminal/resize` — Client resizes the terminal dimensions
 *
 * Terminal output is automatically forwarded to the WebSocket as
 * `terminal/output` messages when a session is active.
 *
 * @param ws - The WebSocket connection.
 * @param messageType - The type of terminal message.
 * @param data - The message payload.
 */
export function handleTerminalMessage(
  ws: WebSocket,
  messageType: string,
  data: Record<string, unknown>,
): void {
  switch (messageType) {
    case "terminal/input": {
      const { sessionId, data: inputData } = data as {
        sessionId: string;
        data: string;
      };
      const session = activeSessions.get(sessionId);
      if (!session) {
        ws.send(
          JSON.stringify({
            messageType: "terminal/error",
            data: {
              sessionId,
              error: "Terminal session not found",
            },
          }),
        );
        return;
      }

      if (session.process.stdin?.writable) {
        session.process.stdin.write(inputData);
      }
      break;
    }

    case "terminal/resize": {
      const {
        sessionId: resizeId,
        cols,
        rows,
      } = data as {
        sessionId: string;
        cols: number;
        rows: number;
      };
      const session = activeSessions.get(resizeId);
      if (!session) return;

      session.cols = cols;
      session.rows = rows;

      // Send SIGWINCH if the process supports it (Unix only)
      if (session.process.pid && os.platform() !== "win32") {
        try {
          process.kill(session.process.pid, "SIGWINCH");
        } catch {
          // Process may not support SIGWINCH — that's acceptable
        }
      }
      break;
    }

    default:
      console.warn(`[Terminal] Unknown message type: ${messageType}`);
  }
}

/**
 * Attaches terminal output streaming to a WebSocket connection.
 *
 * When a terminal session produces stdout or stderr output, it is
 * forwarded to the WebSocket client as `terminal/output` messages.
 *
 * @param ws - The WebSocket connection to stream output to.
 * @param sessionId - The terminal session ID to attach to.
 */
export function attachTerminalOutput(ws: WebSocket, sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const sendOutput = (chunk: Buffer) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          messageType: "terminal/output",
          data: {
            sessionId,
            data: chunk.toString("utf-8"),
          },
        }),
      );
    }
  };

  session.process.stdout?.on("data", sendOutput);
  session.process.stderr?.on("data", sendOutput);
}

/**
 * Returns the map of active terminal sessions.
 * Useful for external inspection or cleanup.
 */
export function getActiveSessions(): Map<string, TerminalSession> {
  return activeSessions;
}
