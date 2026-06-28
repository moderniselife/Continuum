/**
 * ToolCallCard — Renders a single tool call as a collapsible card.
 *
 * Displays tool name, status, arguments, and output in a Liquid Glass
 * styled card. Pending tool calls show approve/reject action buttons.
 * The card auto-expands for pending/running states and collapses when
 * completed.
 *
 * @module components/chat/ToolCallCard
 */

import { useState, useMemo, useCallback } from "react";
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
} from "lucide-react";
import type { ToolCallState } from "@/api/types";

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
  if (["edit_file", "writefile", "write_file", "editfile"].includes(name)) {
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

/** Truncates a string to `maxLen` characters, appending an ellipsis if needed. */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
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
// Main component
// ---------------------------------------------------------------------------

const ToolCallCard = ({ toolCall, onApprove, onReject }: ToolCallCardProps) => {
  // Auto-expand for pending/running, collapse for completed/error
  const defaultExpanded =
    toolCall.status === "pending" || toolCall.status === "running";
  const [expanded, setExpanded] = useState(defaultExpanded);

  const ToolIcon = getToolIcon(toolCall.toolName);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

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
          expanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
        } overflow-hidden`}
      >
        <div className="border-border-glass space-y-3 border-t px-3 py-2.5">
          {/* Arguments section */}
          {toolCall.args && (
            <div>
              <h4 className="text-text-tertiary mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
                Arguments
              </h4>
              <div className="bg-bg-elevated rounded-lg p-2.5">
                <ParsedArgs argsJson={toolCall.args} />
              </div>
            </div>
          )}

          {/* Output section (only when completed) */}
          {toolCall.status === "completed" && toolCall.output && (
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
