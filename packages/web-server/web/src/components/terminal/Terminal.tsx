/**
 * Terminal — Integrated terminal panel using xterm.js.
 *
 * Renders an xterm.js instance within a resizable, glass-styled panel at the
 * bottom of the editor area. Connects to the backend via WebSocket for
 * terminal I/O (stubbed for now — displays a connecting message until the
 * protocol is wired up).
 *
 * Features:
 *  • Liquid Glass header bar with "Terminal" label and close button
 *  • Drag-to-resize handle at the top edge
 *  • xterm.js dark theme matching the Continuum palette
 *  • Auto-fit on resize via FitAddon
 *  • Keyboard shortcut awareness (Ctrl+` to toggle — handled externally)
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { X, Minus, Terminal as TerminalIcon } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";

import "@xterm/xterm/css/xterm.css";

/** xterm colour theme matching Continuum's Liquid Glass palette */
const TERMINAL_THEME = {
  background: "#08080f",
  foreground: "#eaeaf4",
  cursor: "#7c6aff",
  cursorAccent: "#08080f",
  selectionBackground: "rgba(124, 106, 255, 0.3)",
  black: "#08080f",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#7c6aff",
  cyan: "#22d3ee",
  white: "#eaeaf4",
} as const;

export function Terminal() {
  const { terminalHeight, setTerminalHeight, toggleTerminal } = useUIStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">(
    "connecting",
  );

  // Drag-resize state
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Initialise xterm.js
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: TERMINAL_THEME,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Slight delay to ensure DOM has settled before first fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // Container may not be visible yet; that's fine
      }
    });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Attempt to create a terminal session via REST
    createTerminalSession(term, setStatus);

    // Resize observer to re-fit when container changes size
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // Ignore fit errors during rapid resizing
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit when terminalHeight changes
  useEffect(() => {
    requestAnimationFrame(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        /* noop */
      }
    });
  }, [terminalHeight]);

  // ── Resize handle drag ─────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = terminalHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = startYRef.current - moveEvent.clientY;
        setTerminalHeight(startHeightRef.current + delta);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [terminalHeight, setTerminalHeight],
  );

  return (
    <div
      className="border-border-glass bg-bg-base relative flex flex-col border-t"
      style={{ height: terminalHeight }}
    >
      {/* Resize handle */}
      <div
        className="group absolute -top-1 left-0 right-0 z-10 flex h-2 cursor-row-resize items-center justify-center"
        onMouseDown={handleMouseDown}
      >
        <div className="bg-border-glass group-hover:bg-accent-glow h-0.5 w-8 rounded-full transition-colors" />
      </div>

      {/* Header bar */}
      <div className="glass-subtle border-border-glass flex h-7 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-1.5">
          <TerminalIcon size={12} className="text-text-tertiary" />
          <span className="text-text-secondary text-[11px] font-medium">
            Terminal
          </span>
          {status === "connecting" && (
            <span className="text-warning animate-pulse text-[10px]">
              connecting…
            </span>
          )}
          {status === "error" && (
            <span className="text-error text-[10px]">disconnected</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleTerminal}
            className="text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded p-0.5 transition-colors"
            title="Minimise terminal"
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            onClick={toggleTerminal}
            className="text-text-tertiary hover:text-error hover:bg-bg-hover rounded p-0.5 transition-colors"
            title="Close terminal"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden px-1 py-1"
        style={{ backgroundColor: TERMINAL_THEME.background }}
      />
    </div>
  );
}

/* ── Terminal session bootstrap ───────────────────────────────── */

/**
 * Attempts to create a terminal session via the REST API.
 * If it fails, writes a friendly message and retries after a delay.
 *
 * The WebSocket protocol for real-time I/O will be connected in a
 * later iteration — for now this provides a visible placeholder.
 */
async function createTerminalSession(
  term: XTerm,
  setStatus: (s: "connecting" | "connected" | "error") => void,
) {
  const WELCOME = [
    "\x1b[38;2;124;106;255m⚡ Continuum Terminal\x1b[0m",
    "\x1b[38;2;148;148;184m   Integrated terminal for the Continuum Web IDE\x1b[0m",
    "",
  ];
  WELCOME.forEach((line) => term.writeln(line));

  try {
    const res = await fetch("/api/v1/terminal/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: "." }),
    });

    if (res.ok) {
      setStatus("connected");
      term.writeln(
        "\x1b[38;2;52;211;153m✓ Terminal session established\x1b[0m\r\n",
      );
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch {
    setStatus("error");
    term.writeln(
      "\x1b[38;2;148;148;184mTerminal connecting… WebSocket bridge not yet available.\x1b[0m",
    );
    term.writeln(
      "\x1b[38;2;94;94;128mThe terminal will activate once the backend is ready.\x1b[0m",
    );

    // Retry after 5 seconds
    setTimeout(() => {
      createTerminalSession(term, setStatus);
    }, 5000);
  }
}

export default Terminal;
