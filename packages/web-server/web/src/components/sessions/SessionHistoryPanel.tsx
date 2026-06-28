/**
 * SessionHistoryPanel — Sidebar panel listing all past chat sessions.
 *
 * Grouped by date (Today, Yesterday, This Week, etc.) with search,
 * delete, and click-to-open functionality.
 *
 * Liquid Glass design language. Connects to sessionStore + chatStore.
 *
 * @module components/sessions/SessionHistoryPanel
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, MessageSquare, Search, Trash2, X } from "lucide-react";
import { useSessionStore, type DateGroup } from "@/stores/sessionStore";
import { useChatStore } from "@/stores/chatStore";
import type { SessionMetadata } from "@/api/types";

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

// ---------------------------------------------------------------------------
// Session Item
// ---------------------------------------------------------------------------

interface SessionItemProps {
  session: SessionMetadata;
  isActive: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

function SessionItem({
  session,
  isActive,
  onOpen,
  onDelete,
}: SessionItemProps) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onOpen(session.id)}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
      className={`group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-all duration-150 ${
        isActive
          ? "glass border-border-accent text-text-primary border"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
      }`}
    >
      <MessageSquare
        size={14}
        className={`mt-0.5 shrink-0 ${isActive ? "text-accent" : "text-text-tertiary"}`}
      />

      <div className="flex-1 overflow-hidden">
        <div className="truncate text-xs font-medium">{session.title}</div>
        <div className="text-text-tertiary mt-0.5 text-[10px]">
          {session.messageCount ?? 0} messages ·{" "}
          {formatRelativeTime(session.lastModified ?? session.createdAt ?? "")}
        </div>
      </div>

      {showDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session.id);
          }}
          className="text-text-tertiary -mr-1 mt-0.5 shrink-0 rounded-md p-0.5 transition-colors hover:text-red-400"
          title="Delete session"
          aria-label={`Delete session: ${session.title}`}
        >
          <Trash2 size={12} />
        </button>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Session History Panel (exported)
// ---------------------------------------------------------------------------

function SessionHistoryPanel() {
  const sessions = useSessionStore((s) => s.sessions);
  const isLoading = useSessionStore((s) => s.isLoading);
  const error = useSessionStore((s) => s.error);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const removeSession = useSessionStore((s) => s.removeSession);
  const searchQuery = useSessionStore((s) => s.searchQuery);
  const setSearchQuery = useSessionStore((s) => s.setSearchQuery);

  const openSession = useChatStore((s) => s.openSession);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const tabs = useChatStore((s) => s.tabs);

  // Load sessions on mount
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Active session ID (if current tab has one)
  const activeSessionId = useMemo(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    return activeTab?.sessionId ?? null;
  }, [tabs, activeTabId]);

  // Filter and group
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  const groupedSessions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const dayOfWeek = now.getDay();
    const startOfThisWeek = new Date(startOfToday);
    startOfThisWeek.setDate(startOfThisWeek.getDate() - ((dayOfWeek + 6) % 7));

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const groups: { label: DateGroup; sessions: SessionMetadata[] }[] = [
      { label: "Today", sessions: [] },
      { label: "Yesterday", sessions: [] },
      { label: "This Week", sessions: [] },
      { label: "Last Week", sessions: [] },
      { label: "This Month", sessions: [] },
      { label: "Older", sessions: [] },
    ];

    for (const session of filteredSessions) {
      const updated = new Date(session.lastModified ?? session.createdAt ?? 0);

      if (updated >= startOfToday) {
        groups[0].sessions.push(session);
      } else if (updated >= startOfYesterday) {
        groups[1].sessions.push(session);
      } else if (updated >= startOfThisWeek) {
        groups[2].sessions.push(session);
      } else if (updated >= startOfLastWeek) {
        groups[3].sessions.push(session);
      } else if (updated >= startOfThisMonth) {
        groups[4].sessions.push(session);
      } else {
        groups[5].sessions.push(session);
      }
    }

    return groups.filter((g) => g.sessions.length > 0);
  }, [filteredSessions]);

  const handleOpen = useCallback(
    async (id: string) => {
      try {
        await openSession(id);
      } catch (err) {
        console.error("Failed to open session:", err);
      }
    },
    [openSession],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await removeSession(id);
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [removeSession],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border-glass flex items-center gap-2 border-b px-3 py-2.5">
        <Clock size={14} className="text-accent shrink-0" />
        <span className="text-text-primary text-xs font-semibold tracking-wide">
          Chat History
        </span>
        <span className="text-text-tertiary ml-auto text-[10px]">
          {sessions.length} sessions
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="bg-bg-input border-border flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5">
          <Search size={12} className="text-text-tertiary shrink-0" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-text-primary placeholder:text-text-tertiary flex-1 bg-transparent text-xs outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-text-tertiary hover:text-text-secondary"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="text-text-tertiary flex items-center justify-center py-8 text-xs">
            Loading sessions...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-xs text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => loadSessions()}
              className="text-accent text-xs hover:underline"
            >
              Retry
            </button>
          </div>
        ) : groupedSessions.length === 0 ? (
          <div className="text-text-tertiary flex flex-col items-center gap-2 py-8 text-center text-xs">
            <MessageSquare size={24} className="opacity-30" />
            {searchQuery ? (
              <p>No sessions match "{searchQuery}"</p>
            ) : (
              <p>No chat history yet. Start a conversation!</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groupedSessions.map((group) => (
              <div key={group.label}>
                <div className="text-text-tertiary mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.sessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isActive={activeSessionId === session.id}
                      onOpen={handleOpen}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionHistoryPanel;
