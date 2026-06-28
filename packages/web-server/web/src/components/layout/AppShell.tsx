/**
 * AppShell — Root application shell for the Continuum Web IDE.
 *
 * Full IDE layout composing:
 *   ActivityBar → File Explorer → Editor (+ Terminal) → Chat Panel
 *
 * All panels are resizable via drag handles. The animated nebula
 * background provides depth beneath the translucent glass surfaces.
 *
 * @module components/layout/AppShell
 */

import { useCallback, useRef, useEffect } from "react";

import TitleBar from "./TitleBar";
import StatusBar from "./StatusBar";
import ActivityBar from "./ActivityBar";
import ChatPanel from "@/components/chat/ChatPanel";
import EditorPanel from "@/components/editor/EditorPanel";
import FileExplorer from "@/components/explorer/FileExplorer";
import SettingsPanel from "@/components/settings/SettingsPanel";
import TerminalPanel from "@/components/terminal/Terminal";
import { useUIStore } from "@/stores/uiStore";

function AppShell() {
  const activeActivity = useUIStore((s) => s.activeActivity);
  const explorerWidth = useUIStore((s) => s.explorerWidth);
  const setExplorerWidth = useUIStore((s) => s.setExplorerWidth);
  const chatPanelWidth = useUIStore((s) => s.chatPanelWidth);
  const setChatPanelWidth = useUIStore((s) => s.setChatPanelWidth);
  const chatPanelOpen = useUIStore((s) => s.chatPanelOpen);
  const terminalOpen = useUIStore((s) => s.terminalOpen);
  const terminalHeight = useUIStore((s) => s.terminalHeight);
  const setTerminalHeight = useUIStore((s) => s.setTerminalHeight);

  // Whether the side panel (explorer/search/git) should be visible
  const showSidePanel =
    activeActivity === "explorer" ||
    activeActivity === "search" ||
    activeActivity === "git";

  return (
    <div className="bg-nebula relative flex h-screen flex-col overflow-hidden">
      {/* Title bar */}
      <TitleBar />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity bar — always visible */}
        <ActivityBar />

        {/* Side panel (file explorer, search, git) */}
        {showSidePanel && (
          <>
            <div
              className="glass-heavy border-border flex-shrink-0 overflow-hidden border-r"
              style={{ width: explorerWidth }}
            >
              {activeActivity === "explorer" && <FileExplorer />}
              {activeActivity === "search" && (
                <div className="text-text-tertiary flex h-full items-center justify-center p-4">
                  <p className="text-sm">Search coming soon...</p>
                </div>
              )}
              {activeActivity === "git" && (
                <div className="text-text-tertiary flex h-full items-center justify-center p-4">
                  <p className="text-sm">Git panel coming soon...</p>
                </div>
              )}
            </div>

            {/* Explorer resize handle */}
            <ResizeHandle
              direction="horizontal"
              onResize={(delta) =>
                setExplorerWidth(
                  Math.max(180, Math.min(500, explorerWidth + delta)),
                )
              }
            />
          </>
        )}

        {/* Centre content: Editor + Terminal */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <EditorPanel />
          </div>

          {/* Terminal */}
          {terminalOpen && (
            <>
              <ResizeHandle
                direction="vertical"
                onResize={(delta) =>
                  setTerminalHeight(
                    Math.max(100, Math.min(600, terminalHeight - delta)),
                  )
                }
              />
              <div
                className="border-border flex-shrink-0 overflow-hidden border-t"
                style={{ height: terminalHeight }}
              >
                <TerminalPanel />
              </div>
            </>
          )}
        </div>

        {/* Chat panel resize handle + panel */}
        {chatPanelOpen && (
          <>
            <ResizeHandle
              direction="horizontal"
              onResize={(delta) =>
                setChatPanelWidth(
                  Math.max(280, Math.min(700, chatPanelWidth - delta)),
                )
              }
            />
            <div
              className="border-border flex-shrink-0 overflow-hidden border-l"
              style={{ width: chatPanelWidth }}
            >
              <ChatPanel />
            </div>
          </>
        )}
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Settings overlay — rendered above everything */}
      <SettingsPanel />
    </div>
  );
}

/* ─── Resize Handle ──────────────────────────────────────────── */

interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}

/**
 * Draggable resize handle for panels.
 * Fires onResize with pixel delta during drag.
 */
function ResizeHandle({ direction, onResize }: ResizeHandleProps) {
  const isDragging = useRef(false);
  const lastPos = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      lastPos.current = direction === "horizontal" ? e.clientX : e.clientY;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const pos = direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = pos - lastPos.current;
        lastPos.current = pos;
        onResize(delta);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction, onResize],
  );

  const isH = direction === "horizontal";

  return (
    <div
      className={`group relative flex-shrink-0 ${
        isH ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
      } hover:bg-accent/30 transition-colors`}
      onMouseDown={handleMouseDown}
    >
      {/* Wider hit area */}
      <div
        className={`absolute ${
          isH ? "inset-y-0 -left-1 -right-1" : "inset-x-0 -bottom-1 -top-1"
        }`}
      />
      {/* Visible accent line on hover */}
      <div
        className={`bg-accent/0 group-hover:bg-accent/60 absolute transition-colors ${
          isH ? "inset-y-0 left-0 w-px" : "inset-x-0 top-0 h-px"
        }`}
      />
    </div>
  );
}

export default AppShell;
