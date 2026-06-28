/**
 * EditorPanel — Main code editor area for the Continuum Web IDE.
 *
 * When no files are open, displays a premium empty state with a glass card
 * and keyboard shortcut hints. When files are open, renders the EditorTabs
 * bar above a full-height Monaco Editor instance.
 *
 * Keyboard shortcuts:
 *  • ⌘S / Ctrl+S — Save the active file
 */

import { useEffect, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { FileCode2, Search, Save } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { EditorTabs } from "@/components/editor/EditorTabs";

export function EditorPanel() {
  const { openFiles, activeFilePath, updateFileContent, saveFile } =
    useFileStore();

  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? null;

  // ⌘S / Ctrl+S to save the active file
  const handleSave = useCallback(() => {
    if (activeFilePath) {
      saveFile(activeFilePath);
    }
  }, [activeFilePath, saveFile]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // Empty state — no files open
  if (!activeFile) {
    return (
      <div className="bg-bg-base flex h-full flex-1 flex-col items-center justify-center">
        <div className="glass-subtle glass-shine animate-fade-in flex max-w-xs flex-col items-center gap-5 rounded-2xl px-8 py-10 text-center">
          <div className="bg-accent-muted flex h-14 w-14 items-center justify-center rounded-xl">
            <FileCode2 size={28} className="text-accent" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-text-primary text-base font-semibold">
              Open a file to start editing
            </h3>
            <p className="text-text-tertiary text-xs">
              Browse the file explorer or use a keyboard shortcut below
            </p>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <ShortcutHint icon={Search} label="Quick Open" shortcut="⌘P" />
            <ShortcutHint icon={Save} label="Save" shortcut="⌘S" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-base flex h-full flex-1 flex-col">
      {/* Tab bar */}
      <EditorTabs />

      {/* Monaco Editor */}
      <div className="monaco-container flex-1">
        <Editor
          key={activeFile.path}
          height="100%"
          language={activeFile.language}
          value={activeFile.content}
          onChange={(value) => {
            if (activeFile.path) {
              updateFileContent(activeFile.path, value ?? "");
            }
          }}
          theme="vs-dark"
          options={{
            minimap: { enabled: true },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
            lineNumbers: "on",
            bracketPairColorization: { enabled: true },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            tabSize: 2,
            wordWrap: "off",
            scrollBeyondLastLine: true,
            renderLineHighlight: "all",
            roundedSelection: true,
          }}
        />
      </div>
    </div>
  );
}

/* ── Helper: Shortcut hint row ───────────────────────────────── */

function ShortcutHint({
  icon: Icon,
  label,
  shortcut,
}: {
  icon: typeof Search;
  label: string;
  shortcut: string;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <Icon size={13} className="text-text-tertiary" />
      <span className="text-text-secondary">{label}</span>
      <kbd className="bg-bg-elevated text-text-tertiary ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">
        {shortcut}
      </kbd>
    </div>
  );
}

export default EditorPanel;
