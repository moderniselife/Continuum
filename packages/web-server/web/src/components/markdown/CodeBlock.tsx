import { useState, useCallback } from "react";
import { Copy, Check, FileEdit, ClipboardPaste, Loader2 } from "lucide-react";
import { useFileApply } from "@/hooks/useFileApply";
import { useFileStore } from "@/stores/fileStore";
import DiffViewer from "@/components/editor/DiffViewer";

interface CodeBlockProps {
  children: string;
  className?: string;
}

/**
 * Extracts a file path hint from the code content.
 * Looks for common patterns like `// filepath: ...` or `// file: ...`
 * at the start of the code block.
 */
function extractFilePathHint(code: string): string | null {
  const firstLine = code.split("\n")[0]?.trim() ?? "";

  // Match patterns like: // filepath: src/foo.ts, // file: bar.ts, # filepath: baz.py
  const patterns = [
    /^(?:\/\/|#|\/\*)\s*filepath:\s*(.+?)(?:\s*\*\/)?$/i,
    /^(?:\/\/|#|\/\*)\s*file:\s*(.+?)(?:\s*\*\/)?$/i,
    /^(?:\/\/|#|\/\*)\s*path:\s*(.+?)(?:\s*\*\/)?$/i,
  ];

  for (const pattern of patterns) {
    const match = firstLine.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Fenced code block renderer for markdown content.
 * Extracts the language from the className (e.g. 'language-typescript' → 'typescript')
 * and provides copy-to-clipboard, apply-to-file, and insert-at-cursor buttons.
 */
const CodeBlock = ({ children, className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [inserted, setInserted] = useState(false);

  const { diffState, applyToFile, accept, reject, isApplying, error } =
    useFileApply();

  // Extract the language identifier from the className provided by react-markdown
  const language = className?.replace("language-", "") ?? "";

  // Check for a file path hint in the code content
  const filePathHint = extractFilePathHint(children);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Silently fail if clipboard access is unavailable
      console.error("Failed to copy to clipboard:", err);
    }
  }, [children]);

  const handleApply = useCallback(async () => {
    // If we have a file path hint, apply directly to that file
    if (filePathHint) {
      await applyToFile(filePathHint, children);
      return;
    }

    // Otherwise, try to apply to the currently active file in the editor
    const activeFilePath = useFileStore.getState().activeFilePath;
    if (activeFilePath) {
      await applyToFile(activeFilePath, children);
      return;
    }

    // No target file — show a brief warning via console
    console.warn(
      "[CodeBlock] No target file found. Add a comment like '// filepath: src/foo.ts' to the code block.",
    );
  }, [children, filePathHint, applyToFile]);

  const handleInsertAtCursor = useCallback(async () => {
    // Insert at the current cursor position in the active editor
    const { activeFilePath, openFiles, updateFileContent } =
      useFileStore.getState();
    if (!activeFilePath) return;

    const activeFile = openFiles.find((f) => f.path === activeFilePath);
    if (!activeFile) return;

    // Simple insertion: append the code content at the end of the file
    // A more sophisticated implementation would use the Monaco editor cursor position
    const newContent = activeFile.content + "\n" + children;
    updateFileContent(activeFilePath, newContent);

    setInserted(true);
    setTimeout(() => setInserted(false), 2000);
  }, [children]);

  const handleDiffAccept = useCallback(async () => {
    await accept();
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  }, [accept]);

  return (
    <div className="space-y-2">
      <div className="group/code border-border overflow-hidden rounded-lg border">
        {/* Header bar with language label and action buttons */}
        <div className="bg-bg-elevated border-border flex items-center justify-between border-b px-3 py-1.5">
          <span className="text-text-tertiary select-none text-xs uppercase">
            {language}
          </span>

          <div className="flex items-center gap-0.5">
            {/* Insert at cursor button */}
            <button
              type="button"
              onClick={handleInsertAtCursor}
              className="hover:bg-bg-hover text-text-tertiary hover:text-text-primary rounded p-1 opacity-0 transition-all duration-150 group-hover/code:opacity-100"
              aria-label="Insert code at cursor position"
              title="Insert at cursor"
            >
              {inserted ? (
                <Check size={14} className="text-accent" />
              ) : (
                <ClipboardPaste size={14} />
              )}
            </button>

            {/* Apply to file button */}
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
              className="hover:bg-bg-hover text-text-tertiary hover:text-text-primary rounded p-1 opacity-0 transition-all duration-150 disabled:opacity-50 group-hover/code:opacity-100"
              aria-label={
                filePathHint
                  ? `Apply to ${filePathHint}`
                  : "Apply to active file"
              }
              title={
                filePathHint
                  ? `Apply to ${filePathHint}`
                  : "Apply to active file"
              }
            >
              {applied ? (
                <Check size={14} className="text-accent" />
              ) : isApplying ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileEdit size={14} />
              )}
            </button>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className="hover:bg-bg-hover text-text-tertiary hover:text-text-primary rounded p-1 opacity-0 transition-all duration-150 group-hover/code:opacity-100"
              aria-label="Copy code to clipboard"
            >
              {copied ? (
                <Check size={14} className="text-accent" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>

        {/* Code content area */}
        <div className="bg-bg-base overflow-x-auto p-4">
          <pre className="text-text-primary font-mono text-sm">
            <code className={className}>{children}</code>
          </pre>
        </div>
      </div>

      {/* Inline diff confirmation — shown when Apply is triggered */}
      {diffState && (
        <DiffViewer
          originalContent={diffState.original}
          modifiedContent={diffState.modified}
          filePath={diffState.filePath}
          onAccept={handleDiffAccept}
          onReject={reject}
          isApplying={isApplying}
          error={error}
        />
      )}
    </div>
  );
};

export default CodeBlock;
