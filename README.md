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

Continuum is an AI coding agent available as a [VS Code extension](#vs-code), [CLI](#cli), and [JetBrains plugin](#jetbrains). It connects to any LLM to provide autocomplete, chat, editing, and agentic tool use — all running locally in your editor.

This fork is maintained by [@moderniselife](https://github.com/moderniselife) in spare time. It's a passion project, not a full-time endeavour.

## 🆕 What's New Since the Fork

Features and improvements added in Continuum that aren't in the original Continue:

### ⚡ YOLO Mode

> Auto-approve **all** tool calls — terminal commands, MCP tools, file edits — without manual confirmation. Perfect for trusted workflows where you just want the agent to get on with it.

- Toggle via the ⚡ button in the toolbar, or `Cmd+Shift+Y` / `Ctrl+Shift+Y`
- Prominent amber warning banner when active (you can't miss it)
- Persists across sessions with constant visual reminders
- Disabled/excluded tools remain blocked — YOLO respects your boundaries

---

## Getting Started

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
