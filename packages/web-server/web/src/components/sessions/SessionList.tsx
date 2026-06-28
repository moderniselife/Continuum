/**
 * SessionList — Filterable, date-grouped list of sessions.
 *
 * Liquid Glass design: glass group headers, fade-in animations,
 * search filtering, and elegant empty states.
 */

import { useMemo } from "react";
import { MessageSquareOff, SearchX } from "lucide-react";
import { useSessionStore, groupSessionsByDate } from "@/stores/sessionStore";
import type { DateGroup } from "@/stores/sessionStore";
import type { SessionMetadata } from "@/api/types";
import SessionItem from "@/components/sessions/SessionItem";

/**
 * Renders a filterable, date-grouped list of sessions.
 * Displays appropriate empty states when no sessions exist or no results
 * match the search query.
 */
const SessionList = () => {
  const { sessions, searchQuery } = useSessionStore();

  // Filter sessions by the current search query (case-insensitive title match)
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;

    const query = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(query));
  }, [sessions, searchQuery]);

  const groups: Map<DateGroup, SessionMetadata[]> = useMemo(
    () => groupSessionsByDate(filteredSessions),
    [filteredSessions],
  );

  // Empty state: no sessions at all
  if (sessions.length === 0) {
    return (
      <div className="animate-fade-in flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <div className="glass-subtle flex h-12 w-12 items-center justify-center rounded-2xl">
          <MessageSquareOff size={20} className="text-text-tertiary" />
        </div>
        <p className="text-text-tertiary text-center text-sm">
          No conversations yet
        </p>
        <p className="text-text-tertiary text-center text-xs opacity-60">
          Start a new chat to get going
        </p>
      </div>
    );
  }

  // Empty state: search returned no results
  if (filteredSessions.length === 0) {
    return (
      <div className="animate-fade-in flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <div className="glass-subtle flex h-12 w-12 items-center justify-center rounded-2xl">
          <SearchX size={20} className="text-text-tertiary" />
        </div>
        <p className="text-text-tertiary text-center text-sm">
          No results found
        </p>
        <p className="text-text-tertiary text-center text-xs opacity-60">
          Try a different search term
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-1 overflow-y-auto">
      {Array.from(groups.entries()).map(([label, groupSessions]) => (
        <div key={label} className="animate-fade-in">
          {/* Glass group header */}
          <h3 className="glass-subtle text-text-tertiary mb-1 mt-3 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest first:mt-0">
            {label}
          </h3>

          {/* Session items */}
          <div className="space-y-1">
            {groupSessions.map((session) => (
              <SessionItem key={session.id} session={session} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SessionList;
