import { useMemo } from "react";
import { useSessionStore } from "@/stores/sessionStore";
import type { SessionMetadata } from "@/api/types";
import SessionItem from "@/components/sessions/SessionItem";

interface SessionGroup {
  label: string;
  sessions: SessionMetadata[];
}

/**
 * Returns the start-of-day timestamp for a given date in local time.
 */
const startOfDay = (date: Date): number => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Groups sessions into date-based buckets: Today, Yesterday, Previous 7 Days, Older.
 */
const groupSessionsByDate = (sessions: SessionMetadata[]): SessionGroup[] => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 7 * 86_400_000;

  const groups: Record<string, SessionMetadata[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 Days": [],
    Older: [],
  };

  for (const session of sessions) {
    const ts = new Date(
      session.lastModified ?? session.createdAt ?? "",
    ).getTime();
    if (ts >= todayStart) {
      groups["Today"].push(session);
    } else if (ts >= yesterdayStart) {
      groups["Yesterday"].push(session);
    } else if (ts >= weekStart) {
      groups["Previous 7 Days"].push(session);
    } else {
      groups["Older"].push(session);
    }
  }

  // Only return groups that contain sessions
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, sessions: items }));
};

/**
 * Renders a filterable, date-grouped list of sessions.
 * Displays appropriate empty states when no sessions exist or no results match the query.
 */
const SessionList = () => {
  const { sessions, searchQuery } = useSessionStore();

  // Filter sessions by the current search query (case-insensitive title match)
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;

    const query = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(query));
  }, [sessions, searchQuery]);

  const groups = useMemo(
    () => groupSessionsByDate(filteredSessions),
    [filteredSessions],
  );

  // Empty state: no sessions at all
  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-text-tertiary text-sm">No conversations yet</p>
      </div>
    );
  }

  // Empty state: search returned no results
  if (filteredSessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-text-tertiary text-sm">No results found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.label} className="animate-fade-in">
          {/* Group heading */}
          <h3 className="text-text-tertiary px-3 py-2 text-xs font-semibold uppercase tracking-wider">
            {group.label}
          </h3>

          {/* Session items */}
          <div className="space-y-0.5">
            {group.sessions.map((session) => (
              <SessionItem key={session.id} session={session} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SessionList;
