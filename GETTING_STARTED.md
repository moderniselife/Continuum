# Continuum — Getting Started Guide

> **Last updated:** 2026-06-28

This guide covers how to install, build, run, and develop every part of Continuum:
the VS Code extension, the GUI (sidebar), and the standalone Web IDE.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (TL;DR)](#quick-start-tldr)
- [1. VS Code Extension](#1-vs-code-extension)
  - [Install Dependencies](#install-dependencies)
  - [Run in Debug Mode](#run-in-debug-mode-recommended)
  - [Build a VSIX Package](#build-a-vsix-package)
  - [Install the VSIX](#install-the-vsix)
- [2. Web IDE (Standalone Browser UI)](#2-web-ide-standalone-browser-ui)
  - [Development Mode](#development-mode-hot-reload--react-dev-tools)
  - [Production Mode](#production-mode)
- [3. Project Architecture](#3-project-architecture)
- [4. Configuration](#4-configuration)
- [5. Troubleshooting](#5-troubleshooting)

---

## Prerequisites

| Tool              | Version       | Install                                                |
| ----------------- | ------------- | ------------------------------------------------------ |
| **Node.js**       | ≥ 20.20.1 LTS | [nodejs.org](https://nodejs.org) or `nvm use`          |
| **bun**           | ≥ 1.x         | `curl -fsSL https://bun.sh/install \| bash`            |
| **Vite** (global) | ≥ 6.x         | `npm i -g vite`                                        |
| **VS Code**       | Latest        | [code.visualstudio.com](https://code.visualstudio.com) |

```bash
# Verify
node --version   # v20.20.1+
bun --version    # 1.x
vite --version   # 6.x
```

---

## Quick Start (TL;DR)

### VS Code Extension (debug mode)

```bash
cd /Users/josephshenton/Projects/continue

# 1. Install all dependencies
npm install          # root workspace
cd gui && npm install && cd ..
cd extensions/vscode && npm install && cd ../..

# 2. Build the GUI
cd gui && npm run build && cd ..

# 3. Open in VS Code and press F5
code .
# → Run & Debug → "Launch extension"
```

### Web IDE (dev mode with hot-reload)

```bash
cd /Users/josephshenton/Projects/continue

# Terminal 1: Start the backend API server
cd packages/web-server
bun install
npx tsx src/index.ts --port 3333 --workspace /path/to/your/project

# Terminal 2: Start the Vite dev server (React dev mode)
cd packages/web-server/web
bun install
bun run dev

# Open http://localhost:5173
```

---

## 1. VS Code Extension

### Install Dependencies

From the project root:

```bash
cd /Users/josephshenton/Projects/continue

# Root workspace (includes core, shared tooling)
npm install

# GUI (the sidebar React app)
cd gui
npm install
cd ..

# VS Code extension
cd extensions/vscode
npm install
cd ../..
```

### Run in Debug Mode (Recommended)

This launches a new VS Code window with the extension loaded:

1. Open the project in VS Code:

   ```bash
   code /Users/josephshenton/Projects/continue
   ```

2. Build the GUI (sidebar):

   ```bash
   cd gui && npm run build && cd ..
   ```

3. Press **F5** or go to **Run & Debug** → select **"Launch extension"** → click ▶️

4. A new VS Code window opens with Continuum loaded in the sidebar.

> [!TIP] > **Hot-reload:** GUI changes auto-refresh via Vite. For `core/` or `extensions/vscode/` changes, press `Cmd+Shift+P` → "Reload Window" in the debug window.

### Build a VSIX Package

To create an installable `.vsix` file:

```bash
cd /Users/josephshenton/Projects/continue

# 1. Build the GUI
cd gui && npm run build && cd ..

# 2. Pre-package (copies dependencies, binaries, config schemas)
cd extensions/vscode
npm run prepackage

# 3. Build the extension bundle
npm run esbuild-base -- --minify

# 4. Package into a .vsix
npm run package
```

The `.vsix` file will be in `extensions/vscode/build/`.

> [!NOTE]
> For a pre-release build: `npm run package:pre-release`

### Install the VSIX

```bash
# Option A: VS Code CLI
code --install-extension extensions/vscode/build/continuum-*.vsix

# Option B: VS Code UI
# → Extensions panel → ⋯ menu → "Install from VSIX..."
# → Select the .vsix file from extensions/vscode/build/
```

After installing, reload VS Code (`Cmd+Shift+P` → "Reload Window").

---

## 2. Web IDE (Standalone Browser UI)

The Web IDE is a completely separate React app that provides a browser-based coding interface with chat history, model selection, and session management.

### Development Mode (Hot-Reload + React Dev Tools)

You need **two terminals** — one for the backend API, one for the frontend:

#### Terminal 1: Backend API Server

```bash
cd /Users/josephshenton/Projects/continue/packages/web-server

# Install dependencies (first time only)
bun install

# Start the backend on port 3333
npx tsx src/index.ts --port 3333 --workspace /path/to/your/project
```

The backend provides:

- REST API at `http://localhost:3333/api/v1/`
- WebSocket at `ws://localhost:3333/ws`
- Reads sessions from `~/.continue/sessions/`
- Reads models from `~/.continue/config.yaml`

#### Terminal 2: Vite Dev Server (Frontend)

```bash
cd /Users/josephshenton/Projects/continue/packages/web-server/web

# Install dependencies (first time only)
bun install

# Start the Vite dev server
bun run dev
```

**Open `http://localhost:5173`** in your browser.

> [!IMPORTANT]
> Start the **backend first** (Terminal 1), then the frontend (Terminal 2). The Vite dev server proxies `/api/*` and `/ws` to `localhost:3333`. If the backend isn't running, you'll get `ECONNREFUSED` errors.

Benefits of dev mode:

- ✅ Full, un-minified React error messages
- ✅ React DevTools support
- ✅ Hot Module Replacement (instant UI updates)
- ✅ Source maps for debugging

### Production Mode

Build the frontend and serve everything from one process:

```bash
cd /Users/josephshenton/Projects/continue/packages/web-server

# 1. Build the web frontend (outputs to packages/web-server/public/)
cd web && bun run build && cd ..

# 2. Start the server (serves both API + static frontend)
npx tsx src/index.ts --port 3333 --workspace /path/to/your/project
```

**Open `http://localhost:3333`** — the server serves the built frontend and API from the same port.

### API Server Options

```
npx tsx src/index.ts [options]

Options:
  --port, -p <number>      Port to listen on (default: 3333)
  --host, -h <string>      Host to bind to (default: 0.0.0.0)
  --workspace, -w <path>   Workspace directory for the AI agent
  --open, -o               Open browser on start
```

### REST API Endpoints

| Method   | Endpoint               | Description                             |
| -------- | ---------------------- | --------------------------------------- |
| `GET`    | `/api/v1/health`       | Server health check                     |
| `GET`    | `/api/v1/sessions`     | List all chat sessions                  |
| `GET`    | `/api/v1/sessions/:id` | Get a session with full message history |
| `DELETE` | `/api/v1/sessions/:id` | Delete a session                        |
| `GET`    | `/api/v1/models`       | List configured LLM models              |
| `GET`    | `/api/v1/config`       | Get current configuration               |
| `PUT`    | `/api/v1/config`       | Update configuration                    |
| `GET`    | `/api/v1/tools`        | List available tools                    |
| `POST`   | `/api/v1/chat`         | Chat via REST (SSE — coming soon)       |
| `WS`     | `/ws`                  | WebSocket for real-time chat            |

---

## 3. Project Architecture

```
continue/
├── core/                          # AI engine, LLM providers, indexing
├── gui/                           # VS Code sidebar React app
│   ├── src/
│   └── package.json               # build, build:web, dev
├── extensions/
│   └── vscode/                    # VS Code extension host
│       ├── src/
│       ├── scripts/               # prepackage.js, package.js
│       └── package.json           # esbuild, package, prepackage
├── packages/
│   └── web-server/                # Standalone web IDE backend
│       ├── src/
│       │   ├── index.ts           # CLI entry point
│       │   ├── server.ts          # Express + WS server
│       │   ├── routes/api.ts      # REST endpoints
│       │   ├── auth/middleware.ts  # Token auth
│       │   └── ws/                # WebSocket handler, Core bridge
│       ├── public/                # Built frontend (output of web/build)
│       ├── web/                   # Standalone web IDE frontend
│       │   ├── src/
│       │   │   ├── api/           # REST client, WS client, types
│       │   │   ├── stores/        # Zustand state management
│       │   │   └── components/    # React components
│       │   ├── vite.config.ts     # Dev proxy config
│       │   └── package.json       # dev, build, typecheck
│       └── package.json
└── package.json                   # Root workspace
```

---

## 4. Configuration

Continuum reads configuration from `~/.continue/`:

| File                                 | Purpose                                                 |
| ------------------------------------ | ------------------------------------------------------- |
| `~/.continue/config.yaml`            | Main configuration (models, providers, API keys, roles) |
| `~/.continue/config.ts`              | TypeScript config (advanced customisation)              |
| `~/.continue/sessions/`              | Chat session history files                              |
| `~/.continue/sessions/sessions.json` | Session index with metadata                             |

### Example `config.yaml`

```yaml
name: Main Config
version: 1.0.0
schema: v1
models:
  - name: Claude Sonnet 4.6
    provider: anthropic
    model: claude-sonnet-4-6
    apiKey: sk-ant-api03-...
    roles:
      - chat
      - edit
      - apply
    defaultCompletionOptions:
      contextLength: 200000
      maxTokens: 64000
    capabilities:
      - tool_use
      - image_input
```

### Authentication (Web IDE)

Set the `CONTINUUM_API_TOKEN` environment variable to require Bearer token auth:

```bash
CONTINUUM_API_TOKEN=my-secret-token npx tsx src/index.ts --port 3333
```

When unset, auth is disabled (suitable for local development).

---

## 5. Troubleshooting

### "ECONNREFUSED" on localhost:5173

The backend isn't running. Start it first:

```bash
cd packages/web-server && npx tsx src/index.ts --port 3333 --workspace .
```

### "Minified React error #31"

You're running the production build. Use dev mode for full errors:

```bash
cd packages/web-server/web && bun run dev
# Open http://localhost:5173 instead of :3333
```

### "No models configured"

The API reads from `~/.continue/config.yaml`. Ensure it exists and has a `models:` section.

### WebSocket keeps disconnecting

The Core engine may be crashing during initialisation. Check the backend terminal for `RangeError` or `path.relative` errors. These are non-fatal and the WS should reconnect.

### Extension not loading after VSIX install

1. Reload VS Code: `Cmd+Shift+P` → "Reload Window"
2. Check the extension is enabled: Extensions panel → search "Continuum"
3. Check Output panel: `View` → `Output` → select "Continuum" from dropdown

### Port already in use

```bash
# Kill whatever is on the port
lsof -ti:3333 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```
