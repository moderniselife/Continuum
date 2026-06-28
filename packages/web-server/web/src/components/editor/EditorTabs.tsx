/**
 * EditorTabs — Horizontal tab bar for open files in the editor.
 *
 * Features:
 *  • Liquid Glass design with `glass-subtle` backdrop
 *  • Active/inactive tab states with accent border highlight
 *  • Modified (dirty) indicator — small accent dot before filename
 *  • Close button visible on hover with error-coloured hover state
 *  • Middle-click to close a tab
 *  • Right-click context menu: Close, Close Others, Close All
 *  • Horizontally scrollable when many tabs are open
 *  • File type icons via FileIcon component
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { FileIcon } from "@/components/explorer/FileIcon";

export function EditorTabs() {
  const { openFiles, activeFilePath, setActiveFile, closeFile } =
    useFileStore();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setContextMenu(null);
    };
    window.addEventListener("mousedown", handleClose);
    window.addEventListener("keydown", handleClose);
    return () => {
      window.removeEventListener("mousedown", handleClose);
      window.removeEventListener("keydown", handleClose);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path });
  }, []);

  const handleCloseOthers = useCallback(
    (keepPath: string) => {
      openFiles.forEach((f) => {
        if (f.path !== keepPath) closeFile(f.path);
      });
      setContextMenu(null);
    },
    [openFiles, closeFile],
  );

  const handleCloseAll = useCallback(() => {
    openFiles.forEach((f) => closeFile(f.path));
    setContextMenu(null);
  }, [openFiles, closeFile]);

  if (openFiles.length === 0) return null;

  return (
    <div className="relative">
      {/* Tab bar */}
      <div
        ref={scrollRef}
        className="glass-subtle border-border-glass flex h-9 items-center gap-0 overflow-x-auto border-b"
        style={{ scrollbarWidth: "none" }}
      >
        {openFiles.map((file) => {
          const isActive = file.path === activeFilePath;
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => setActiveFile(file.path)}
              onAuxClick={(e) => {
                // Middle-click to close
                if (e.button === 1) {
                  e.preventDefault();
                  closeFile(file.path);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, file.path)}
              className={`group relative flex h-full shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-bg-active text-text-primary border-accent border-b-2"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover border-b-2 border-transparent"
              }`}
            >
              {/* File icon */}
              <FileIcon filename={file.name} size={14} />

              {/* Dirty indicator */}
              {file.isDirty && (
                <span className="bg-accent h-1.5 w-1.5 shrink-0 rounded-full" />
              )}

              {/* File name */}
              <span className="max-w-[120px] truncate">{file.name}</span>

              {/* Close button — visible on hover or when active */}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(file.path);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    closeFile(file.path);
                  }
                }}
                className={`ml-0.5 flex h-4 w-4 items-center justify-center rounded transition-all ${
                  isActive
                    ? "hover:text-error hover:bg-bg-hover opacity-60 hover:opacity-100"
                    : "hover:text-error hover:bg-bg-hover opacity-0 hover:!opacity-100 group-hover:opacity-60"
                }`}
              >
                <X size={12} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="glass-heavy animate-fade-in fixed z-50 min-w-[160px] rounded-lg py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ContextMenuItem
            label="Close"
            onClick={() => {
              closeFile(contextMenu.path);
              setContextMenu(null);
            }}
          />
          <ContextMenuItem
            label="Close Others"
            onClick={() => handleCloseOthers(contextMenu.path)}
            disabled={openFiles.length <= 1}
          />
          <div className="border-border-glass mx-2 my-1 border-t" />
          <ContextMenuItem label="Close All" onClick={handleCloseAll} />
        </div>
      )}
    </div>
  );
}

/** Small context-menu item */
function ContextMenuItem({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
        disabled
          ? "text-text-tertiary cursor-not-allowed"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}

export default EditorTabs;
