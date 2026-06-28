/**
 * SessionItem — Renders a single session entry in the sidebar list.
 *
 * Liquid Glass design: frosted glass card with left mode-colour accent bar,
 * lift + shadow on hover, accent border + glow when active, fade-in animation.
 */

import { useCallback } from "react";
import { Trash2, MessageSquare } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { SessionMetadata } from "@/api/types";

interface SessionItemProps {
  session: SessionMetadata;
}

/** Map mode to its left-bar colour class. */
const MODE_BAR_COLOUR: Record<string, string> = {
  chat: "bg-mode-chat",
  agent: "bg-mode-agent",
  plan: "bg-mode-plan",
  yolo: "bg-mode-yolo",
  background: "bg-mode-chat",
};

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
 * Shows title, mode badge, relative timestamp, message count, and a
 * delete button on hover. Uses animate-fade-in for mount animation.
 */
const SessionItem = ({ session }: SessionItemProps) => {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const openSession = useChatStore((s) => s.openSession);
  const removeSession = useSessionStore((s) => s.removeSession);

  // A session is "active" if the currently active tab is backed by this session
  const activeTab = useChatStore((s) => s.getActiveTab());
  const isActive = activeTab?.sessionId === session.id;

  const mode = session.mode ?? "chat";
  const barColour = MODE_BAR_COLOUR[mode] ?? MODE_BAR_COLOUR.chat;

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
      className={`animate-fade-in group relative flex cursor-pointer items-stretch gap-0 overflow-hidden rounded-xl transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${
        isActive
          ? "glass border-border-accent glow-accent border shadow-lg"
          : "hover:bg-bg-hover hover:-translate-y-[1px] hover:shadow-md"
      }`}
    >
      {/* Left mode-colour accent bar */}
      <div
        className={`w-[3px] shrink-0 rounded-l-xl ${barColour} transition-all duration-200 ${
          isActive ? "opacity-100" : "opacity-50 group-hover:opacity-80"
        }`}
      />

      {/* Session info */}
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <p className="text-text-primary truncate text-sm font-medium leading-tight">
          {session.title}
        </p>

        <div className="mt-1.5 flex items-center gap-2">
          {/* Mode badge */}
          <span
            className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/90 ${barColour}`}
          >
            {mode}
          </span>

          {/* Relative time */}
          <span className="text-text-tertiary text-[11px]">
            {formatRelativeTime(
              session.lastModified ?? session.createdAt ?? "",
            )}
          </span>

          {/* Message count */}
          {(session.messageCount ?? 0) > 0 && (
            <span className="text-text-tertiary flex items-center gap-0.5 text-[11px]">
              <MessageSquare size={10} />
              {session.messageCount}
            </span>
          )}
        </div>
      </div>

      {/* Delete button — visible on hover */}
      <button
        type="button"
        onClick={handleDelete}
        className="text-text-tertiary absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 opacity-0 transition-all duration-150 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
        aria-label={`Delete session: ${session.title}`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
};

export default SessionItem;
