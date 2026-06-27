import chalk from "chalk";
import * as path from "path";

/**
 * Start the Continuum Web Server.
 *
 * Usage: continuum web [options]
 *
 * This launches the full web UI + API server, serving the Continuum
 * React GUI over HTTP and exposing REST/WebSocket endpoints.
 */

interface WebOptions {
  port?: string;
  host?: string;
  workspace?: string;
  token?: string;
  open?: boolean;
}

export async function web(options: WebOptions = {}) {
  const port = parseInt(options.port || "3000", 10);
  const host = options.host || "localhost";
  const workspace = options.workspace || process.cwd();

  // Set token env var if provided
  if (options.token) {
    process.env.CONTINUUM_API_TOKEN = options.token;
  }

  console.log(chalk.blue("\n⚡ Starting Continuum Web Server...\n"));

  try {
    // Dynamic import to avoid loading web-server deps when not needed
    const { createContinuumServer } = await import(
      // @ts-ignore — resolved at runtime from the monorepo
      "../../../packages/web-server/src/server.js"
    );

    const { httpServer, wsHandler, coreManager } = createContinuumServer({
      port,
      host,
      workspaceDirs: [path.resolve(workspace)],
    });

    // Log connections
    wsHandler.onConnection((conn: any) => {
      console.log(chalk.green(`  ⚡ Client connected: ${conn.id}`));
    });

    wsHandler.onDisconnection((id: string) => {
      console.log(chalk.dim(`  ✖  Client disconnected: ${id}`));
    });

    httpServer.listen(port, host, async () => {
      const url = `http://${host}:${port}`;
      const authStatus = process.env.CONTINUUM_API_TOKEN
        ? chalk.green("🔒 Enabled")
        : chalk.yellow("🔓 Disabled");

      console.log(chalk.bold("  ⚡ Continuum Web Server"));
      console.log(chalk.dim("  ────────────────────────────────────────"));
      console.log(`  🌐 URL:        ${chalk.cyan(url)}`);
      console.log(`  📂 Workspace:  ${chalk.dim(workspace)}`);
      console.log(`  🔑 Auth:       ${authStatus}`);
      console.log(`  📡 API:        ${chalk.dim(`${url}/api/v1`)}`);
      console.log(`  🔌 WebSocket:  ${chalk.dim(`ws://${host}:${port}/ws`)}`);
      console.log(chalk.dim("  ────────────────────────────────────────"));
      console.log();

      if (options.open) {
        try {
          const open = await import("open");
          await (open as any).default(url);
        } catch {
          // open not available
        }
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log(chalk.yellow("\n  Shutting down Continuum Web Server..."));
      wsHandler.close();
      httpServer.close(() => {
        console.log(chalk.dim("  Server stopped."));
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error: any) {
    console.error(chalk.red(`\nFailed to start web server: ${error.message}`));
    console.error(
      chalk.dim(
        "\nMake sure the web-server package is built:\n  cd packages/web-server && npm install",
      ),
    );
    process.exit(1);
  }
}
