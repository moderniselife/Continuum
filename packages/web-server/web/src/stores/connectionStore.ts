/**
 * Continuum Web IDE — Connection Store
 *
 * Tracks WebSocket connection status, server version, and exposes
 * `connect` / `disconnect` actions that drive the global WS singleton.
 *
 * @module stores/connectionStore
 */

import { create } from "zustand";
import type { WsConnectionStatus, HealthResponse } from "@/api/types";
import { ws } from "@/api/ws";
import { health } from "@/api/rest";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface ConnectionState {
  /** Current WebSocket connection status. */
  status: WsConnectionStatus;
  /** Human-readable error message if something went wrong. */
  error: string | null;
  /** Server SemVer version, populated after a successful health check. */
  serverVersion: string | null;
  /** Full health response from the last successful check. */
  healthData: HealthResponse | null;

  // -- Actions --------------------------------------------------------------
  /** Establish the WebSocket connection and fetch server health. */
  connect: () => Promise<void>;
  /** Gracefully tear down the WebSocket connection. */
  disconnect: () => void;
  /** Re-fetch server health without reconnecting the socket. */
  refreshHealth: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useConnectionStore = create<ConnectionState>((set, get) => {
  // Subscribe to WS status changes and mirror them into the store.
  ws.onStatusChange((status) => {
    set({ status });

    // Clear previous errors once we're back online.
    if (status === "connected") {
      set({ error: null });
    }
  });

  return {
    status: ws.getStatus(),
    error: null,
    serverVersion: null,
    healthData: null,

    connect: async () => {
      try {
        ws.connect();

        // Fetch server health in parallel — it's a REST call that doesn't
        // require the WS to be fully open.
        const data = await health();
        set({
          serverVersion: data.version,
          healthData: data,
          error: null,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect";
        set({ error: message });
        console.error("[connectionStore] Connection error:", err);
      }
    },

    disconnect: () => {
      ws.disconnect();
      set({
        status: "disconnected",
        error: null,
      });
    },

    refreshHealth: async () => {
      try {
        const data = await health();
        set({
          serverVersion: data.version,
          healthData: data,
          error: null,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Health check failed";
        set({ error: message });
      }
    },
  };
});
