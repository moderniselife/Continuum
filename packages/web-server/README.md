# Continuum Web Server

A standalone web server that provides a **full browser-based IDE** powered by Continuum's AI engine. Access your AI coding assistant from any device with a web browser — no VS Code required.

## Features

- 🌐 **Browser-based IDE** — Full chat interface with all AI modes
- ⚡ **All chat modes** — Chat, Agent, Plan, Background, and YOLO mode
- 📂 **File explorer** — Browse and edit workspace files (Phase 2)
- 🎨 **Monaco editor** — VS Code-quality code editing with IntelliSense (Phase 2)
- 🔌 **REST API** — Programmatic access to sessions, config, and models
- 🔒 **Token authentication** — Secure remote access with `--token`
- 🔄 **WebSocket streaming** — Real-time chat with streaming responses
- 📱 **Responsive** — Works on desktop, tablet, and mobile

## Quick Start

### Prerequisites

- Node.js 20+ or Bun
- An existing `~/.continuum/config.yaml` with at least one model configured

### Running

```bash
# From the monorepo root
cd packages/web-server

# Install dependencies
bun install
cd web && bun install && cd ..

# Build the web UI
cd web && bun run build && cd ..

# Start the server
npx tsx src/index.ts --port 3000 --workspace ~/my-project
```

Then open `http://localhost:3000` in your browser.

### CLI Options

| Flag                 | Default     | Description                                      |
| -------------------- | ----------- | ------------------------------------------------ |
| `--port <port>`      | `3000`      | Port to listen on                                |
| `--host <host>`      | `localhost` | Host to bind to. Use `0.0.0.0` for remote access |
| `--workspace <path>` | `.` (cwd)   | Workspace directory for file operations          |
| `--token <token>`    | _(none)_    | API authentication token                         |
| `--open`             | `false`     | Open browser automatically on start              |

### With Authentication

For remote access, **always use a token**:

```bash
npx tsx src/index.ts --host 0.0.0.0 --port 3000 --token my-secret-token
```

Clients must include the token in:

- **HTTP**: `Authorization: Bearer my-secret-token` header
- **WebSocket**: `?token=my-secret-token` query parameter

### Via the CLI

If you have the Continuum CLI installed:

```bash
continuum web --port 3000 --workspace ~/my-project --open
```

---

## Architecture

```
┌─────────────┐      HTTP/WS      ┌──────────────────────┐
│   Browser   │ ◄──────────────► │   Express Server     │
│   (React)   │                   │                      │
│             │   GET /api/v1/*   │   REST API           │
│  Web IDE UI │   WS  /ws         │   WebSocket Handler  │
│             │                   │                      │
└─────────────┘                   │   ┌──────────────┐   │
                                  │   │ CoreManager  │   │
                                  │   │  (per conn)  │   │
                                  │   │              │   │
                                  │   │  Core Engine  │   │
                                  │   │  WebIDE      │   │
                                  │   └──────────────┘   │
                                  └──────────────────────┘
```

### Key Design Decisions

1. **One Core per WebSocket connection** — Each browser tab gets its own AI engine instance with independent state
2. **WebIDE handles filesystem** — File operations (read, write, git, terminal) are handled server-side via Node.js, not forwarded to the browser
3. **REST for CRUD, WebSocket for chat** — Sessions, config, and models use REST; streaming chat uses WebSocket
4. **Separate from VS Code GUI** — The web UI is a completely standalone React app, not the VS Code extension panel

---

## REST API Reference

All endpoints are prefixed with `/api/v1`.

### Health

```
GET /api/v1/health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-06-28T07:00:00.000Z",
  "version": "0.1.0",
  "uptime": 123.456
}
```

### Sessions

```
GET /api/v1/sessions?offset=0&limit=50
```

**Response:**

```json
{
  "sessions": [
    {
      "id": "abc-123",
      "title": "Fix login bug",
      "createdAt": "2026-06-28T06:00:00.000Z",
      "lastModified": "2026-06-28T06:30:00.000Z",
      "messageCount": 12
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 50
}
```

```
GET /api/v1/sessions/:id       # Get full session with messages
DELETE /api/v1/sessions/:id    # Delete a session
```

### Config

```
GET /api/v1/config             # Read config (YAML string)
PUT /api/v1/config             # Update config file
```

### Models

```
GET /api/v1/models             # List configured models
```

**Response:**

```json
{
  "models": [
    {
      "name": "Claude Sonnet 4.6",
      "provider": "anthropic",
      "model": "claude-sonnet-4-6",
      "roles": ["chat", "edit", "apply"]
    }
  ]
}
```

---

## WebSocket Protocol

Connect to `/ws` (or `/ws?token=<token>` with auth).

### Message Format

All messages are JSON:

```json
{
  "messageType": "llm/streamChat",
  "messageId": "unique-uuid",
  "data": { ... }
}
```

### Streaming Responses

For streaming endpoints (e.g. `llm/streamChat`), the server sends multiple frames:

```json
{ "done": false, "status": "success", "content": "partial text..." }
{ "done": false, "status": "success", "content": "more text..." }
{ "done": true,  "status": "success", "content": "final chunk" }
```

### Key Message Types

| Type                              | Direction       | Description                 |
| --------------------------------- | --------------- | --------------------------- |
| `llm/streamChat`                  | Client → Server | Stream a chat response      |
| `history/list`                    | Client → Server | List session history        |
| `history/load`                    | Client → Server | Load a full session         |
| `history/save`                    | Client → Server | Save a session              |
| `history/delete`                  | Client → Server | Delete a session            |
| `config/getSerializedProfileInfo` | Client → Server | Get current config          |
| `configUpdate`                    | Server → Client | Config changed notification |
| `abort`                           | Client → Server | Abort current streaming     |

### Chat Modes

| Mode         | Description             | Protocol Flag                               |
| ------------ | ----------------------- | ------------------------------------------- |
| `chat`       | Standard conversation   | Default                                     |
| `agent`      | Autonomous tool use     | `isInAgentMode: true`                       |
| `plan`       | Step-by-step planning   | `mode: 'plan'`                              |
| `background` | Background processing   | `mode: 'background'`                        |
| `yolo`       | Auto-approve everything | `isInAgentMode: true, allowAutoApply: true` |

---

## Development

### Project Structure

```
packages/web-server/
├── web/                  # React web UI (Vite + TailwindCSS)
│   ├── src/
│   │   ├── api/          # WebSocket + REST clients
│   │   ├── stores/       # Zustand state management
│   │   ├── components/   # React components
│   │   │   ├── layout/   # AppShell, TitleBar, Sidebar, StatusBar
│   │   │   ├── chat/     # ChatPanel, ChatView, ChatInput, etc.
│   │   │   ├── markdown/ # MarkdownRenderer, CodeBlock
│   │   │   ├── sessions/ # SessionList, SessionTabs
│   │   │   └── shared/   # Button, Dropdown, Tooltip
│   │   └── styles/       # TailwindCSS globals + theme
│   └── package.json
├── src/                  # Express + WebSocket server
│   ├── server.ts         # Server factory
│   ├── index.ts          # CLI entry point
│   ├── routes/api.ts     # REST endpoints
│   ├── ws/               # WebSocket handling
│   │   ├── handler.ts    # Connection lifecycle
│   │   └── CoreManager.ts # Core engine per connection
│   ├── ide/WebIDE.ts     # IDE interface via Node.js
│   └── auth/middleware.ts # Token authentication
├── public/               # Built web UI (served by Express)
└── package.json
```

### Building the Web UI

```bash
cd packages/web-server/web
bun install
bun run build          # Production build → ../public/
bun run dev            # Dev server with HMR (proxies to backend)
bun run typecheck      # Type checking only
```

### Running the Backend

```bash
cd packages/web-server
npx tsx src/index.ts --port 3333 --workspace /path/to/project
```

### Development Workflow

1. Start the backend: `npx tsx src/index.ts --port 3333`
2. In another terminal, start the UI dev server: `cd web && bun run dev`
3. Open `http://localhost:5173` — Vite proxies API/WS to port 3333

---

## Configuration

The web server reads configuration from `~/.continuum/config.yaml`. This is the same config file used by the VS Code extension.

Example config:

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

> ⚠️ **Security Note**: API keys are stored in plain text in the config file. When exposing the web server to the network, always use `--token` authentication.

---

## Licence

Apache 2.0
