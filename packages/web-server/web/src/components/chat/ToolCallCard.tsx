/**
 * ToolCallCard — Renders a single tool call as a collapsible card.
 *
 * Displays tool name, status, arguments, and output in a Liquid Glass
 * styled card. Pending tool calls show approve/reject action buttons.
 * Completed file-edit tool calls show an inline DiffViewer for
 * accept/reject confirmation. The card auto-expands for pending/running
 * states and collapses when completed.
 *
 * @module components/chat/ToolCallCard
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Terminal,
  FileEdit,
  Search,
  Eye,
  FolderOpen,
  Globe,
  Wrench,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  FilePlus2,
} from "lucide-react";
import type { ToolCallState } from "@/api/types";
import { readFile } from "@/api/files";
import DiffViewer from "@/components/editor/DiffViewer";
import { useFileApply } from "@/hooks/useFileApply";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tool names that represent file write/edit operations. */
const FILE_EDIT_TOOLS = new Set([
  "edit_file",
  "writefile",
  "write_file",
  "editfile",
  "createnewfile",
  "create_new_file",
  "multi_edit",
  "multiedit",
  "str_replace_editor",
  "replace_in_file",
  "insert_code_block",
  "insertcodeblock",
]);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ToolCallCardProps {
  /** The tool call state to render. */
  toolCall: ToolCallState;
  /** Callback fired when the user approves a pending tool call. */
  onApprove?: (id: string) => void;
  /** Callback fired when the user rejects a pending tool call. */
  onReject?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Icon mapping — selects an appropriate icon based on the tool name
// ---------------------------------------------------------------------------

/** Returns a lucide-react icon component appropriate for the given tool name. */
function getToolIcon(toolName: string) {
  const name = toolName.toLowerCase();

  if (["run_command", "subprocess", "runterminalcommand"].includes(name)) {
    return Terminal;
  }
  if (FILE_EDIT_TOOLS.has(name)) {
    return FileEdit;
  }
  if (["readfile", "read_file"].includes(name)) {
    return Eye;
  }
  if (["searchfiles", "search_files"].includes(name)) {
    return Search;
  }
  if (["listdir", "list_dir"].includes(name)) {
    return FolderOpen;
  }
  if (["fetch", "web"].includes(name)) {
    return Globe;
  }

  return Wrench;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncates a string to `maxLen` characters, appending an ellipsis if needed. */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/** Checks whether a tool call represents a file edit operation. */
function isFileEditTool(toolName: string): boolean {
  return FILE_EDIT_TOOLS.has(toolName.toLowerCase());
}

/**
 * Extracts the file path and new content from a tool call's arguments.
 * Handles various arg shapes from different tool implementations.
 */
function extractFileEditArgs(
  argsJson: string,
): { filePath: string; content: string } | null {
  try {
    const parsed = JSON.parse(argsJson);
    if (typeof parsed !== "object" || parsed === null) return null;

    // Common arg patterns for file path
    const filePath =
      parsed.path ??
      parsed.filePath ??
      parsed.file_path ??
      parsed.filename ??
      parsed.file ??
      parsed.TargetFile ??
      parsed.targetFile ??
      null;

    // Common arg patterns for file content
    const content =
      parsed.contents ??
      parsed.content ??
      parsed.new_content ??
      parsed.newContent ??
      parsed.text ??
      parsed.CodeContent ??
      parsed.codeContent ??
      null;

    if (typeof filePath === "string" && typeof content === "string") {
      return { filePath, content };
    }

    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Status badge sub-component
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
  error,
}: {
  status: ToolCallState["status"];
  error?: string;
}) {
  switch (status) {
    case "pending":
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
          <Circle size={8} className="animate-pulse fill-amber-400" />
          Awaiting approval
        </span>
      );
    case "running":
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-blue-400">
          <Loader2 size={12} className="animate-spin" />
          Running…
        </span>
      );
    case "completed":
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <CheckCircle2 size={12} />
          Completed
        </span>
      );
    case "error":
      return (
        <span
          className="flex items-center gap-1.5 text-xs font-medium text-red-400"
          title={error}
        >
          <XCircle size={12} />
          {error ? truncate(error, 60) : "Error"}
        </span>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Diff status badge — shown instead of "Completed" when diff is active
// ---------------------------------------------------------------------------

function DiffStatusBadge({ accepted }: { accepted: boolean | null }) {
  if (accepted === true) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <CheckCircle2 size={12} />
        Changes applied
      </span>
    );
  }
  if (accepted === false) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-red-400">
        <XCircle size={12} />
        Changes rejected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
      <FileEdit size={12} className="animate-pulse" />
      Review changes
    </span>
  );
}

// ---------------------------------------------------------------------------
// Parsed arguments renderer
// ---------------------------------------------------------------------------

function ParsedArgs({ argsJson }: { argsJson: string }) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(argsJson);
    } catch {
      return null;
    }
  }, [argsJson]);

  if (!parsed || typeof parsed !== "object") {
    // Fallback: render raw string if it's not valid JSON
    return (
      <pre className="text-text-secondary overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">
        {argsJson}
      </pre>
    );
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {Object.entries(parsed).map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-text-tertiary truncate font-mono text-xs">
            {key}
          </dt>
          <dd className="text-text-secondary overflow-x-auto whitespace-pre-wrap font-mono text-xs">
            {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Inline diff section — fetches original content and renders DiffViewer
// ---------------------------------------------------------------------------

function InlineDiffSection({
  toolCall,
  fileEditArgs,
}: {
  toolCall: ToolCallState;
  fileEditArgs: { filePath: string; content: string };
}) {
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { diffState, applyToFile, accept, reject, isApplying, error } =
    useFileApply();

  // null = pending review, true = accepted, false = rejected
  const [decision, setDecision] = useState<boolean | null>(null);

  // Fetch original file content on mount
  useEffect(() => {
    let cancelled = false;

    const fetchOriginal = async () => {
      setIsLoading(true);
      try {
        const result = await readFile(fileEditArgs.filePath);
        if (!cancelled) {
          setOriginalContent(result.content);
        }
      } catch {
        // File may not exist yet (new file creation)
        if (!cancelled) {
          setOriginalContent("");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchOriginal();
    return () => {
      cancelled = true;
    };
  }, [fileEditArgs.filePath]);

  const handleAccept = useCallback(async () => {
    await applyToFile(fileEditArgs.filePath, fileEditArgs.content);
  }, [applyToFile, fileEditArgs]);

  // Watch for diffState to appear (means applyToFile completed) and auto-accept
  useEffect(() => {
    if (diffState) {
      accept().then(() => {
        setDecision(true);
      });
    }
  }, [diffState, accept]);

  const handleReject = useCallback(() => {
    setDecision(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <Loader2 size={14} className="animate-spin text-blue-400" />
        <span className="text-text-tertiary text-xs">Loading diff…</span>
      </div>
    );
  }

  if (decision !== null) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
        <DiffStatusBadge accepted={decision} />
      </div>
    );
  }

  return (
    <DiffViewer
      originalContent={originalContent ?? ""}
      modifiedContent={fileEditArgs.content}
      filePath={fileEditArgs.filePath}
      onAccept={handleAccept}
      onReject={handleReject}
      isApplying={isApplying}
      error={error ?? loadError}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ToolCallCard = ({ toolCall, onApprove, onReject }: ToolCallCardProps) => {
  // Auto-expand for pending/running, collapse for completed/error
  const defaultExpanded =
    toolCall.status === "pending" || toolCall.status === "running";
  const [expanded, setExpanded] = useState(defaultExpanded);

  const ToolIcon = getToolIcon(toolCall.toolName);

  // Check if this is a file-edit tool with extractable args
  const fileEditArgs = useMemo(() => {
    if (
      isFileEditTool(toolCall.toolName) &&
      toolCall.status === "completed" &&
      toolCall.args
    ) {
      return extractFileEditArgs(toolCall.args);
    }
    return null;
  }, [toolCall.toolName, toolCall.status, toolCall.args]);

  // Auto-expand completed file-edit tools so users see the diff
  const shouldShowDiff = fileEditArgs !== null;

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Auto-expand when the tool completes and has a diff to show
  useEffect(() => {
    if (shouldShowDiff && toolCall.status === "completed") {
      setExpanded(true);
    }
  }, [shouldShowDiff, toolCall.status]);

  return (
    <div className="glass-subtle border-border-glass animate-fade-in overflow-hidden rounded-xl border">
      {/* Header */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-white/5"
      >
        {/* Tool icon */}
        <div className="text-accent flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/5">
          <ToolIcon size={14} />
        </div>

        {/* Tool name */}
        <span className="text-text-primary truncate font-mono text-xs font-medium">
          {toolCall.toolName}
        </span>

        {/* Status badge */}
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={toolCall.status} error={toolCall.error} />
          <ChevronDown
            size={14}
            className={`text-text-tertiary shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Collapsible body */}
      <div
        className={`transition-all duration-200 ease-in-out ${
          expanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
        } overflow-hidden`}
      >
        <div className="border-border-glass space-y-3 border-t px-3 py-2.5">
          {/* Inline diff for file-edit tools */}
          {shouldShowDiff && (
            <InlineDiffSection
              toolCall={toolCall}
              fileEditArgs={fileEditArgs}
            />
          )}

          {/* Arguments section — hidden for file-edit tools with diff */}
          {toolCall.args && !shouldShowDiff && (
            <div>
              <h4 className="text-text-tertiary mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
                Arguments
              </h4>
              <div className="bg-bg-elevated max-h-[300px] overflow-auto rounded-lg p-2.5">
                <ParsedArgs argsJson={toolCall.args} />
              </div>
            </div>
          )}

          {/* Output section (only when completed and no diff is shown) */}
          {toolCall.status === "completed" &&
            toolCall.output &&
            !shouldShowDiff && (
              <div>
                <h4 className="text-text-tertiary mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
                  Output
                </h4>
                <div className="bg-bg-elevated max-h-[200px] overflow-auto rounded-lg p-2.5">
                  <pre className="text-text-secondary whitespace-pre-wrap font-mono text-xs leading-relaxed">
                    {toolCall.output}
                  </pre>
                </div>
              </div>
            )}

          {/* Error details (only when status is error) */}
          {toolCall.status === "error" && toolCall.error && (
            <div>
              <h4 className="text-text-tertiary mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
                Error
              </h4>
              <div className="max-h-[200px] overflow-auto rounded-lg bg-red-500/10 p-2.5">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-red-400">
                  {toolCall.error}
                </pre>
              </div>
            </div>
          )}

          {/* Approve / Reject buttons (only when pending) */}
          {toolCall.status === "pending" && (onApprove || onReject) && (
            <div className="flex items-center gap-2 pt-1">
              {onApprove && (
                <button
                  type="button"
                  onClick={() => onApprove(toolCall.id)}
                  className="gradient-accent rounded-lg px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.97]"
                >
                  Approve
                </button>
              )}
              {onReject && (
                <button
                  type="button"
                  onClick={() => onReject(toolCall.id)}
                  className="glass-subtle border-border-glass rounded-lg border px-3.5 py-1.5 text-xs font-medium text-red-400 transition-all duration-150 hover:bg-red-500/10 active:scale-[0.97]"
                >
                  Reject
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ToolCallCard;
