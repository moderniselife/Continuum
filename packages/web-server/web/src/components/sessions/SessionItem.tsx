import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { SessionMetadata } from "@/api/types";

interface SessionItemProps {
  session: SessionMetadata;
}

/**
 * Formats a relative time string from an ISO-8601 timestamp.
 * E.g. "just now", "5m ago", "2h ago", "3d ago".
 */
const formatRelativeTime = (isoDate: string): string => {
  const now = Date.now();
  const timestamp = new Date(isoDate).getTime();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;

  return new Date(timestamp).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
};

/**
 * Renders a single session entry in the session list.
 * Shows title, relative timestamp, message count, and a delete button on hover.
 */
const SessionItem = ({ session }: SessionItemProps) => {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const openSession = useChatStore((s) => s.openSession);
  const removeSession = useSessionStore((s) => s.removeSession);

  // A session is "active" if the currently active tab is backed by this session
  const activeTab = useChatStore((s) => s.getActiveTab());
  const isActive = activeTab?.sessionId === session.id;

  const handleClick = useCallback(() => {
    openSession(session.id);
  }, [session.id, openSession]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeSession(session.id);
    },
    [session.id, removeSession],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
      className={`animate-slide-in group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition-all duration-150 ${
        isActive ? "bg-bg-active border-accent border-l-2" : "hover:bg-bg-hover"
      } `}
    >
      {/* Session info */}
      <div className="min-w-0 flex-1">
        <p className="text-text-primary truncate text-sm font-medium">
          {session.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-text-tertiary text-xs">
            {formatRelativeTime(session.updatedAt)}
          </span>
          <span className="bg-bg-elevated text-text-tertiary rounded-full px-1.5 py-0.5 text-xs">
            {session.messageCount}
          </span>
        </div>
      </div>

      {/* Delete button — visible on hover */}
      <button
        type="button"
        onClick={handleDelete}
        className="hover:bg-bg-hover text-text-tertiary rounded p-1 opacity-0 transition-all duration-150 hover:text-red-400 group-hover:opacity-100"
        aria-label={`Delete session: ${session.title}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

export default SessionItem;
