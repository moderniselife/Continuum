/**
 * DiffViewer — Renders a side-by-side or inline diff of file changes.
 *
 * Uses the Monaco DiffEditor for rich, syntax-highlighted inline diffs.
 * Includes a file path header, accept/reject action buttons, and
 * Liquid Glass card styling to match the IDE aesthetic.
 *
 * @module components/editor/DiffViewer
 */

import { useMemo, useCallback, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import {
  FileEdit,
  FilePlus2,
  Check,
  X,
  Loader2,
  Columns2,
  Rows2,
} from "lucide-react";
import { getLanguage } from "@/stores/fileStore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiffViewerProps {
  /** Content before the change. Empty string for new file creation. */
  originalContent: string;
  /** Proposed new content. */
  modifiedContent: string;
  /** Full file path being modified. */
  filePath: string;
  /** Callback when the user accepts the change. */
  onAccept: () => void;
  /** Callback when the user rejects the change. */
  onReject: () => void;
  /** Whether an accept/write operation is currently in progress. */
  isApplying?: boolean;
  /** Optional error message to display. */
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts the filename from a full file path. */
function basename(filePath: string): string {
  const segments = filePath.split("/");
  return segments[segments.length - 1] || filePath;
}

/** Shortens a file path for display, keeping the last N segments. */
function shortenPath(filePath: string, maxSegments = 4): string {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length <= maxSegments) return filePath;
  return `…/${segments.slice(-maxSegments).join("/")}`;
}

/** Counts insertions and deletions between two content strings. */
function diffStats(original: string, modified: string) {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");

  // Simple line-based comparison for stats
  const origSet = new Set(origLines);
  const modSet = new Set(modLines);

  let insertions = 0;
  let deletions = 0;

  for (const line of modLines) {
    if (!origSet.has(line)) insertions++;
  }
  for (const line of origLines) {
    if (!modSet.has(line)) deletions++;
  }

  return { insertions, deletions };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DiffViewer = ({
  originalContent,
  modifiedContent,
  filePath,
  onAccept,
  onReject,
  isApplying = false,
  error = null,
}: DiffViewerProps) => {
  const [sideBySide, setSideBySide] = useState(false);

  const language = useMemo(() => getLanguage(basename(filePath)), [filePath]);
  const isNewFile = originalContent === "";
  const stats = useMemo(
    () => diffStats(originalContent, modifiedContent),
    [originalContent, modifiedContent],
  );

  const handleToggleLayout = useCallback(() => {
    setSideBySide((prev) => !prev);
  }, []);

  return (
    <div className="glass-subtle border-border-glass animate-fade-in overflow-hidden rounded-xl border">
      {/* File path header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* File icon */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/5">
          {isNewFile ? (
            <FilePlus2 size={14} className="text-emerald-400" />
          ) : (
            <FileEdit size={14} className="text-accent" />
          )}
        </div>

        {/* File path */}
        <div className="min-w-0 flex-1">
          <span
            className="text-text-primary truncate font-mono text-xs font-medium"
            title={filePath}
          >
            {shortenPath(filePath)}
          </span>
          <div className="flex items-center gap-2">
            {isNewFile ? (
              <span className="text-[10px] font-medium text-emerald-400">
                New file
              </span>
            ) : (
              <>
                {stats.insertions > 0 && (
                  <span className="text-[10px] font-medium text-emerald-400">
                    +{stats.insertions}
                  </span>
                )}
                {stats.deletions > 0 && (
                  <span className="text-[10px] font-medium text-red-400">
                    −{stats.deletions}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Layout toggle */}
        <button
          type="button"
          onClick={handleToggleLayout}
          className="text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded p-1 transition-colors duration-150"
          title={
            sideBySide ? "Switch to inline diff" : "Switch to side-by-side diff"
          }
        >
          {sideBySide ? <Rows2 size={14} /> : <Columns2 size={14} />}
        </button>
      </div>

      {/* Monaco Diff Editor */}
      <div className="border-border-glass border-t">
        <DiffEditor
          height="300px"
          original={originalContent}
          modified={modifiedContent}
          language={language}
          theme="vs-dark"
          options={{
            renderSideBySide: sideBySide,
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
            renderOverviewRuler: false,
            overviewRulerBorder: false,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="border-border-glass border-t bg-red-500/10 px-3 py-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="border-border-glass flex items-center justify-end gap-2 border-t px-3 py-2">
        <button
          type="button"
          onClick={onReject}
          disabled={isApplying}
          className="glass-subtle border-border-glass flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-red-400 transition-all duration-150 hover:bg-red-500/10 active:scale-[0.97] disabled:opacity-50"
        >
          <X size={12} />
          Reject
        </button>

        <button
          type="button"
          onClick={onAccept}
          disabled={isApplying}
          className="gradient-accent flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.97] disabled:opacity-50"
        >
          {isApplying ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Applying…
            </>
          ) : (
            <>
              <Check size={12} />
              Accept
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default DiffViewer;
