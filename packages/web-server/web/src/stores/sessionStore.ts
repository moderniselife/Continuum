/**
 * Continuum Web IDE — Session Store
 *
 * Manages the list of chat sessions: fetching, creating, updating, deleting,
 * and client-side search/grouping. All mutations optimistically update the
 * local state and reconcile with the server.
 *
 * @module stores/sessionStore
 */

import { create } from "zustand";
import type { SessionMetadata, Session } from "@/api/types";
import { listSessions, getSession, deleteSession } from "@/api/rest";

// ---------------------------------------------------------------------------
// Date grouping helpers
// ---------------------------------------------------------------------------

/** Friendly date group labels for the session sidebar. */
export type DateGroup =
  | "Today"
  | "Yesterday"
  | "This Week"
  | "Last Week"
  | "This Month"
  | "Older";

/**
 * Partition an array of sessions into labelled date groups.
 * Suitable for rendering a grouped sidebar list.
 */
export function groupSessionsByDate(
  sessions: SessionMetadata[],
): Map<DateGroup, SessionMetadata[]> {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const dayOfWeek = now.getDay(); // 0 = Sunday
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - ((dayOfWeek + 6) % 7)); // Monday-based

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups = new Map<DateGroup, SessionMetadata[]>([
    ["Today", []],
    ["Yesterday", []],
    ["This Week", []],
    ["Last Week", []],
    ["This Month", []],
    ["Older", []],
  ]);

  for (const session of sessions) {
    const updated = new Date(session.lastModified ?? session.createdAt ?? 0);

    if (updated >= startOfToday) {
      groups.get("Today")!.push(session);
    } else if (updated >= startOfYesterday) {
      groups.get("Yesterday")!.push(session);
    } else if (updated >= startOfThisWeek) {
      groups.get("This Week")!.push(session);
    } else if (updated >= startOfLastWeek) {
      groups.get("Last Week")!.push(session);
    } else if (updated >= startOfThisMonth) {
      groups.get("This Month")!.push(session);
    } else {
      groups.get("Older")!.push(session);
    }
  }

  // Prune empty groups — no need to render headings with nothing underneath.
  for (const [key, value] of groups) {
    if (value.length === 0) {
      groups.delete(key);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface SessionState {
  /** Lightweight session metadata list (sidebar). */
  sessions: SessionMetadata[];
  /** Fully hydrated session cache, keyed by session ID. */
  sessionCache: Map<string, Session>;
  /** Current search/filter query. */
  searchQuery: string;
  /** `true` while the session list is being loaded. */
  isLoading: boolean;
  /** Error message from the most recent operation. */
  error: string | null;

  // -- Actions --------------------------------------------------------------
  /** Fetch session list from the server. */
  loadSessions: () => Promise<void>;
  /** Fetch a single session's full data (with messages). */
  fetchSession: (id: string) => Promise<Session>;
  /** Remove a session by ID (server + local). */
  removeSession: (id: string) => Promise<void>;
  /** Update the search filter string. */
  setSearchQuery: (query: string) => void;
  /** Return sessions filtered by the current search query. */
  getFilteredSessions: () => SessionMetadata[];
  /** Return sessions grouped into date buckets. */
  getGroupedSessions: () => Map<DateGroup, SessionMetadata[]>;
  /**
   * Upsert session metadata into the local list.
   * Used by other stores (e.g. chatStore) to keep the sidebar in sync
   * without a full reload.
   */
  upsertSessionMeta: (meta: SessionMetadata) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  sessionCache: new Map(),
  searchQuery: "",
  isLoading: false,
  error: null,

  loadSessions: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await listSessions();
      const sessions = response.sessions ?? [];

      // Sort newest-first by default.
      sessions.sort(
        (a, b) =>
          new Date(b.lastModified ?? b.createdAt ?? 0).getTime() -
          new Date(a.lastModified ?? a.createdAt ?? 0).getTime(),
      );

      set({ sessions, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load sessions";
      set({ error: message, isLoading: false });
      console.error("[sessionStore] loadSessions error:", err);
    }
  },

  fetchSession: async (id: string) => {
    // Return cached copy if available.
    const cached = get().sessionCache.get(id);
    if (cached) return cached;

    try {
      const session = await getSession(id);
      set((state) => {
        const next = new Map(state.sessionCache);
        next.set(id, session);
        return { sessionCache: next };
      });
      return session;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch session";
      set({ error: message });
      throw err;
    }
  },

  removeSession: async (id: string) => {
    // Optimistic removal from local state.
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    }));

    try {
      await deleteSession(id);

      // Also evict from cache.
      set((state) => {
        const next = new Map(state.sessionCache);
        next.delete(id);
        return { sessionCache: next };
      });
    } catch (err) {
      // Rollback: re-fetch the full list.
      console.error("[sessionStore] removeSession error:", err);
      get().loadSessions();
      throw err;
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  getFilteredSessions: () => {
    const { sessions, searchQuery } = get();
    if (!searchQuery.trim()) return sessions;

    const lowerQuery = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(lowerQuery));
  },

  getGroupedSessions: () => {
    const filtered = get().getFilteredSessions();
    return groupSessionsByDate(filtered);
  },

  upsertSessionMeta: (meta: SessionMetadata) => {
    set((state) => {
      const exists = state.sessions.findIndex((s) => s.id === meta.id);
      let next: SessionMetadata[];
      if (exists >= 0) {
        next = [...state.sessions];
        next[exists] = meta;
      } else {
        next = [meta, ...state.sessions];
      }
      // Re-sort after upsert.
      next.sort(
        (a, b) =>
          new Date(b.lastModified ?? b.createdAt ?? 0).getTime() -
          new Date(a.lastModified ?? a.createdAt ?? 0).getTime(),
      );
      return { sessions: next };
    });
  },
}));
