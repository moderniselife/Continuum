<h1 align="center">⚡ Continuum</h1>

<p align="center"><strong>Continue, evolved.</strong> A community-maintained fork of the pioneering open-source coding agent.</p>

<div align="center">

<a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" /></a>
<a href="https://github.com/moderniselife/Continuum"><img src="https://img.shields.io/badge/Fork-Continuum-amber" /></a>
<a href="https://docs.continue.dev"><img src="https://img.shields.io/badge/Docs-docs.continue.dev-blue" /></a>

</div>

<br />

> **Continuum** picks up where [Continue](https://github.com/continuedev/continue) left off. The original `continuedev/continue` repository is no longer actively maintained — Continuum is a community fork that aims to keep the project alive, add quality-of-life improvements, and explore new features.

---

## What is Continuum?

Continuum is an AI coding agent available as a [VS Code extension](#vs-code), [Web IDE](#web-ide), [CLI](#cli), and [JetBrains plugin](#jetbrains). It connects to any LLM to provide autocomplete, chat, editing, and agentic tool use — all running locally in your editor.

This fork is maintained by [@moderniselife](https://github.com/moderniselife) in spare time. It's a passion project, not a full-time endeavour.

## 🆕 What's New Since the Fork

Features and improvements added in Continuum that aren't in the original Continue:

### ⚡ YOLO Mode

> Auto-approve **all** tool calls — terminal commands, MCP tools, file edits — without manual confirmation. Perfect for trusted workflows where you just want the agent to get on with it.

- Toggle via the ⚡ button in the toolbar, or `Cmd+Shift+Y` / `Ctrl+Shift+Y`
- Prominent amber warning banner when active (you can't miss it)
- Persists across sessions with constant visual reminders
- Disabled/excluded tools remain blocked — YOLO respects your boundaries

### 🌐 Continuum Web IDE

> A full browser-based IDE experience — like VS Code in the browser, without the VS Code dependency. Run `npx tsx packages/web-server/src/index.ts --workspace /path/to/project` and open `localhost:3333`.

**Design:** Hyper Green accent (`#00ff87`) with a Liquid Glass aesthetic — translucent frosted panels, glowing accents, and animated nebula backgrounds.

#### Core Features

| Feature                 | Description                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **Monaco Editor**       | Full-featured code editor with syntax highlighting, bracket matching, minimap, and auto-layout |
| **File Explorer**       | Browse, create, rename, delete files and folders. Expand/collapse directories                  |
| **Integrated Terminal** | XTerm.js terminal with WebSocket PTY — run commands directly in the browser                    |
| **AI Chat Panel**       | Multi-tab chat interface with model/mode selectors, streaming, and context attachment          |
| **Model Selector**      | Switch between LLM providers and models on the fly                                             |
| **Settings Panel**      | Full YAML config editor with validation and save                                               |

#### IntelliSense & Linting

| Feature                      | Description                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **TypeScript IntelliSense**  | Completions, hover docs, signature help — powered by Monaco's TypeScript worker                             |
| **Project tsconfig Loading** | Automatically loads `tsconfig.json` from your workspace for proper path alias resolution (`@/`, `~/`, etc.) |
| **Auto Type Acquisition**    | Fetches `.d.ts` type declarations from `node_modules` for imported packages                                 |
| **Semantic Diagnostics**     | Red squiggles for type errors, missing imports, and syntax issues                                           |
| **Cross-file References**    | Open files register with the language service for go-to-definition and imports                              |

#### Search & Replace

| Feature                     | Description                                                         |
| --------------------------- | ------------------------------------------------------------------- |
| **Full-text Search**        | Search across all workspace files with ripgrep (with grep fallback) |
| **Case Sensitivity**        | Toggle case-sensitive matching                                      |
| **Regex Support**           | Toggle regular expression search patterns                           |
| **Include/Exclude Filters** | Glob patterns to narrow search scope (e.g. `*.ts`, `!node_modules`) |
| **Replace & Replace All**   | Replace individual matches or all matches across the workspace      |
| **Result Highlighting**     | Click any result to open the file at the matching line              |

#### Source Control (Git)

| Feature                     | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| **Branch Display**          | Shows current branch name with badge                                 |
| **Staged / Unstaged Files** | Visual file status with stage/unstage controls                       |
| **Commit**                  | Commit message input with `⌘+Enter` shortcut                         |
| **Git Submodules**          | View, commit within, and stage submodule changes in the parent repo  |
| **Recent Commits**          | Log of last 20 commits with hash, message, author, and relative date |
| **Diff Viewing**            | View diffs for changed files                                         |

#### Chat & AI

| Feature                  | Description                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| **Multi-tab Chat**       | Open multiple independent chat sessions as tabs                       |
| **Session History**      | Browse, search, and restore past chat sessions (date-grouped sidebar) |
| **Mode Switching**       | Chat, Agent, Plan, and custom modes                                   |
| **Streaming**            | Real-time token-by-token response streaming                           |
| **YOLO Mode**            | Auto-approve tool calls per-tab                                       |
| **Token Usage Tracking** | Live token count + estimated cost in the toolbar                      |

#### Rules & Skills

| Feature            | Description                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| **Rules Engine**   | Global and project-scoped `.continuum/rules/` with full CRUD                    |
| **Skills System**  | Auto-discovered `.continuum/skills/` with trigger matching and SKILL.md support |
| **Modelled after** | AntiGravity / Claude Code customisation patterns                                |

### 📊 Token Usage Tracking (Extension)

> Track how many tokens you're using, input/output split, thinking tokens, cached tokens, and estimated cost — right in the chat bar.

- `⚡ 1.2K · $0.003` badge in the InputToolbar (always visible)
- Click to expand: full breakdown by model, input/output/thinking/cached
- Session-level aggregation with per-model cost

### 🛡️ Skills & Rules (Extension)

> AntiGravity / Claude Code–style customisation system for the VS Code extension.

- **Skills**: Auto-discovered from `.continuum/skills/` with `SKILL.md` (YAML frontmatter + instructions)
- **Rules**: `.continuum/rules/` markdown files for behavioural constraints
- Full CRUD in the extension sidebar with filesystem-backed persistence

---

## Getting Started

### Web IDE

Run the Web IDE server:

```bash
cd packages/web-server
npx tsx src/index.ts --port 3333 --workspace /path/to/your/project
```

Then open [http://localhost:3333](http://localhost:3333) in your browser.

Options:

| Flag          | Description                     | Default           |
| ------------- | ------------------------------- | ----------------- |
| `--port`      | HTTP port                       | `3333`            |
| `--workspace` | Project directory to open       | Current directory |
| `--token`     | Bearer token for authentication | None (disabled)   |

For development (hot-reload frontend):

```bash
# Terminal 1: Backend
cd packages/web-server && npx tsx src/index.ts --port 3333 --workspace /path/to/project

# Terminal 2: Frontend (Vite dev server)
cd packages/web-server/web && bun run dev
```

### VS Code

The easiest way to get started. Install from source:

```bash
git clone https://github.com/moderniselife/Continuum.git
cd Continuum
./scripts/install-dependencies.sh
```

Then open in VS Code → Run & Debug → `Launch extension`.

To build a `.vsix` package:

```bash
cd extensions/vscode
npm run package
# Install: code --install-extension build/continue-*.vsix
```

### CLI

```bash
npm install -g @continuedev/cli
```

### JetBrains

> We recommend using the CLI instead of the JetBrains plugin.

See [extensions/intellij](extensions/intellij) for the JetBrains source.

## Architecture

```
continuum/
├── core/                    # Shared core logic (LLM, indexing, config)
├── extensions/
│   ├── vscode/              # VS Code extension
│   └── intellij/            # JetBrains plugin
├── gui/                     # Extension webview UI (React + Tailwind)
├── packages/
│   └── web-server/
│       ├── src/             # Express backend (REST + WebSocket + terminal)
│       └── web/             # Web IDE frontend (React + Vite + Monaco)
├── binary/                  # Standalone binary build
└── docs/                    # Documentation site
```

### Web IDE Stack

- **Frontend**: React 18, Vite, TailwindCSS, Monaco Editor, XTerm.js, Zustand
- **Backend**: Express, WebSocket (ws), node-pty, TypeScript
- **Design**: Liquid Glass theme with Hyper Green accent
- **Package Manager**: Bun (preferred), npm fallback

## Documentation

For configuration, customisation, and architecture details, see the [Continue Docs](https://docs.continue.dev). Most of the original documentation still applies — Continuum-specific docs will be added as features diverge.

---

## 🤝 Contributing

Continuum is maintained in spare time. Here's how contributions work:

### What's welcome

- **Quality-of-life fixes** — bug fixes, UI polish, developer experience improvements
- **Feature ideas** — open an issue to discuss before building
- **Documentation** — especially for new Continuum-specific features

### What to expect

- **Nothing is guaranteed.** This is a passion project with limited bandwidth.
- **Support is limited** but I'll do my best to review PRs and respond to issues.
- **Be patient.** Reviews may take time. Good PRs with clear descriptions help enormously.
- **Major features** should be discussed in an issue first to avoid wasted effort.

### How to contribute

1. Fork the repo and create a feature branch
2. Make your changes with clean commits
3. Open a PR against `main` with a clear description
4. Wait for review — I'll get to it when I can

---

## Standing on the Shoulders of Giants

Continuum exists because of the incredible work done by the Continue team and its 900+ contributors. This project wouldn't be possible without them.

<a href="https://github.com/continuedev/continue/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=continuedev/continue&max=500" />
</a>

### Original Project

- **Repository**: [continuedev/continue](https://github.com/continuedev/continue) (archived, read-only)
- **Documentation**: [docs.continue.dev](https://docs.continue.dev)
- **Final release**: Continue 2.0.0

---

## License

Apache 2.0 © 2023-2026 Continue Dev, Inc.

Continuum fork © 2026 [@moderniselife](https://github.com/moderniselife)
