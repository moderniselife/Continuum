/**
 * useFileApply — Hook for applying file changes with diff confirmation.
 *
 * Orchestrates the read → diff → accept/reject workflow used by both
 * the ToolCallCard (for AI-generated edits) and the CodeBlock apply
 * button (for inline code snippets).
 *
 * @module hooks/useFileApply
 */

import { useState, useCallback } from "react";
import { readFile, writeFile } from "@/api/files";
import { useFileStore } from "@/stores/fileStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffState {
  /** Full path of the file being modified. */
  filePath: string;
  /** Content before the change. */
  original: string;
  /** Proposed new content. */
  modified: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Provides state and actions for applying file content with a diff
 * confirmation step.
 *
 * Usage:
 * ```ts
 * const { diffState, applyToFile, accept, reject } = useFileApply();
 *
 * // Trigger a diff review
 * await applyToFile("/src/foo.ts", newCode);
 *
 * // User decides
 * await accept();   // writes to disk
 * reject();         // dismisses the diff
 * ```
 */
export function useFileApply() {
  const [diffState, setDiffState] = useState<DiffState | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Begin the diff review flow.
   * Fetches the original file content and stages the diff for user review.
   * For new files (where readFile fails), the original content is empty.
   */
  const applyToFile = useCallback(
    async (filePath: string, newContent: string) => {
      setError(null);
      try {
        let original = "";
        try {
          const result = await readFile(filePath);
          original = result.content;
        } catch {
          // File doesn't exist yet — treat as a new file creation
          original = "";
        }

        setDiffState({ filePath, original, modified: newContent });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to read file";
        setError(message);
        console.error("[useFileApply] Error preparing diff:", err);
      }
    },
    [],
  );

  /**
   * Accept the proposed changes and write them to the file system.
   * Also updates the file store if the file is currently open in the editor.
   */
  const accept = useCallback(async () => {
    if (!diffState) return;

    setIsApplying(true);
    setError(null);

    try {
      await writeFile(diffState.filePath, diffState.modified);

      // If the file is open in the editor, update its content in the store
      const { openFiles, updateFileContent } = useFileStore.getState();
      const openFile = openFiles.find((f) => f.path === diffState.filePath);
      if (openFile) {
        updateFileContent(diffState.filePath, diffState.modified);
      }

      setDiffState(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to write file";
      setError(message);
      console.error("[useFileApply] Error writing file:", err);
    } finally {
      setIsApplying(false);
    }
  }, [diffState]);

  /** Reject the proposed changes and dismiss the diff. */
  const reject = useCallback(() => {
    setDiffState(null);
    setError(null);
  }, []);

  return {
    /** Current diff being reviewed, or null if none is active. */
    diffState,
    /** Whether a write operation is in progress. */
    isApplying,
    /** Error message from the last failed operation, if any. */
    error,
    /** Begin the diff review flow for a file. */
    applyToFile,
    /** Accept and write the proposed changes. */
    accept,
    /** Reject and dismiss the proposed changes. */
    reject,
  };
}
