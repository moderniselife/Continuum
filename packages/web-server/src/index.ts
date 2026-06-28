#!/usr/bin/env node
/**
 * Continuum Web Server — Entry Point
 *
 * Starts an Express + WebSocket server that exposes Continuum's AI coding
 * agent via a browser-based UI and REST API endpoints.
 *
 * Usage:
 *   continuum-server [options]
 *   --port <number>       Port to listen on (default: 3000, or CONTINUUM_PORT)
 *   --host <string>       Host to bind to (default: localhost, or CONTINUUM_HOST)
 *   --workspace <path>    Workspace directory (default: cwd)
 *   --token <string>      API authentication token (or CONTINUUM_API_TOKEN)
 *   --open                Open browser on start
 */
import { createContinuumServer } from "./server.js";
import { isAuthEnabled } from "./auth/middleware.js";

// ============================================================
// Parse CLI arguments
// ============================================================
function parseArgs(): {
  port: number;
  host: string;
  workspace: string;
  token?: string;
  open: boolean;
} {
  const args = process.argv.slice(2);
  const options = {
    port: parseInt(process.env.CONTINUUM_PORT ?? "3000", 10),
    host: process.env.CONTINUUM_HOST ?? "localhost",
    workspace: process.cwd(),
    token: process.env.CONTINUUM_API_TOKEN,
    open: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--port":
      case "-p":
        options.port = parseInt(args[++i], 10);
        break;
      case "--host":
      case "-h":
        options.host = args[++i];
        break;
      case "--workspace":
      case "-w":
        options.workspace = args[++i];
        break;
      case "--token":
      case "-t":
        options.token = args[++i];
        break;
      case "--open":
      case "-o":
        options.open = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }

  // Set token as env var so middleware can access it
  if (options.token) {
    process.env.CONTINUUM_API_TOKEN = options.token;
  }

  return options;
}

function printHelp(): void {
  console.log(`
⚡ Continuum Web Server

Usage: continuum-server [options]

Options:
  --port, -p <number>     Port to listen on (default: 3000)
  --host, -h <string>     Host to bind to (default: localhost)
  --workspace, -w <path>  Workspace directory (default: current directory)
  --token, -t <string>    API authentication token
  --open, -o              Open browser on start
  --help                  Show this help message

Environment Variables:
  CONTINUUM_PORT          Port (overridden by --port)
  CONTINUUM_HOST          Host (overridden by --host)
  CONTINUUM_API_TOKEN     Auth token (overridden by --token)
  CONTINUUM_GLOBAL_DIR    Config directory (default: ~/.continuum)

Examples:
  continuum-server --port 8080 --workspace ~/projects/myapp
  continuum-server --host 0.0.0.0 --token my-secret-token --open
`);
}

// ============================================================
// Banner
// ============================================================
function printBanner(options: {
  port: number;
  host: string;
  workspace: string;
}): void {
  const url = `http://${options.host}:${options.port}`;
  const authStatus = isAuthEnabled()
    ? "🔒 Enabled"
    : "🔓 Disabled (set --token to enable)";

  console.log(`
  ⚡ Continuum Web Server
  ────────────────────────────────────────
  🌐 URL:        ${url}
  📂 Workspace:  ${options.workspace}
  🔑 Auth:       ${authStatus}
  📡 API:        ${url}/api/v1
  🔌 WebSocket:  ws://${options.host}:${options.port}/ws
  ────────────────────────────────────────
  `);
}

// ============================================================
// Main
// ============================================================
async function main(): Promise<void> {
  const options = parseArgs();

  const { httpServer, wsHandler } = createContinuumServer({
    port: options.port,
    host: options.host,
    workspaceDirs: [options.workspace],
  });

  // Log WebSocket connections
  wsHandler.onConnection((conn) => {
    console.log(`  ⚡ New client: ${conn.id}`);
  });

  wsHandler.onDisconnection((id) => {
    console.log(`  ✖  Client left: ${id}`);
  });

  // Start listening
  httpServer.listen(options.port, options.host, async () => {
    printBanner(options);

    // Open browser if requested
    if (options.open) {
      try {
        const open = await import("open");
        await open.default(`http://${options.host}:${options.port}`);
      } catch {
        console.log("  (Could not open browser automatically)");
      }
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n  Shutting down Continuum Web Server...");
    wsHandler.close();
    httpServer.close(() => {
      console.log("  Server stopped. Goodbye! ⚡");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start Continuum Web Server:", error);
  process.exit(1);
});
