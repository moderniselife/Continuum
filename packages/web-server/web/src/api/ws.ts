/**
 * Continuum Web IDE — WebSocket Client
 *
 * Provides a singleton `ContinuumWS` class that wraps the native WebSocket API
 * with automatic reconnection, request/response correlation, streaming support,
 * and push-message subscriptions.
 *
 * @module api/ws
 */

import type { WsMessage, WsResponse, WsConnectionStatus } from "./types";

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Initial reconnection delay in milliseconds. */
const INITIAL_BACKOFF_MS = 1_000;
/** Maximum reconnection delay — we cap exponential growth here. */
const MAX_BACKOFF_MS = 30_000;
/** Multiplier applied to backoff on each consecutive failure. */
const BACKOFF_MULTIPLIER = 2;
/** How often (ms) we send a keepalive ping. */
const HEARTBEAT_INTERVAL_MS = 30_000;
/** Timeout (ms) for a single request before we reject the promise. */
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PushHandler = (data: unknown) => void;

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface StreamCallbacks {
  onChunk: (data: unknown) => void;
  resolve: () => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type StatusListener = (status: WsConnectionStatus) => void;

// ---------------------------------------------------------------------------
// ContinuumWS class
// ---------------------------------------------------------------------------

/**
 * WebSocket client with:
 * - Auto-reconnect (exponential backoff 1 s → 30 s)
 * - Correlated request/response via `messageId`
 * - Streaming chunk delivery
 * - Push-message subscriptions
 */
export class ContinuumWS {
  private socket: WebSocket | null = null;
  private status: WsConnectionStatus = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private backoff = INITIAL_BACKOFF_MS;
  private intentionalClose = false;

  /** Pending request/response promises keyed by messageId. */
  private pending = new Map<string, PendingRequest>();
  /** Active streaming callbacks keyed by messageId. */
  private streams = new Map<string, StreamCallbacks>();
  /** Push-message listeners keyed by message type. */
  private listeners = new Map<string, Set<PushHandler>>();
  /** Status-change listeners. */
  private statusListeners = new Set<StatusListener>();

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  /**
   * Derive the WebSocket URL from the current page location.
   * In production the server serves the SPA so we can rely on
   * `window.location`; during development the Vite proxy handles routing.
   */
  private buildUrl(): string {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/ws`;
  }

  /** Open the WebSocket connection. Safe to call multiple times. */
  connect(): void {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return; // already connected or in progress
    }

    this.intentionalClose = false;
    this.setStatus("connecting");
    const url = this.buildUrl();

    const socket = new WebSocket(url);

    socket.onopen = () => {
      this.backoff = INITIAL_BACKOFF_MS;
      this.setStatus("connected");
      this.startHeartbeat();
    };

    socket.onmessage = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    socket.onerror = () => {
      // Error event alone doesn't close the socket — onclose fires next.
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      if (!this.intentionalClose) {
        this.setStatus("reconnecting");
        this.scheduleReconnect();
      } else {
        this.setStatus("disconnected");
      }
      this.rejectAllPending("WebSocket connection closed");
    };

    this.socket = socket;
  }

  /** Gracefully close the connection. No automatic reconnection. */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
    this.setStatus("disconnected");
    this.rejectAllPending("WebSocket intentionally disconnected");
  }

  /** Subscribe to connection status changes. Returns an unsubscribe fn. */
  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    // Immediately notify current state
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Retrieve the current connection status. */
  getStatus(): WsConnectionStatus {
    return this.status;
  }

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  /**
   * Send a typed request and wait for the correlated response.
   *
   * @param type  The message type (e.g. "session/list")
   * @param data  Payload to send.
   * @returns     Parsed response payload of type `T`.
   */
  request<T = unknown>(type: string, data: unknown = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const messageId = crypto.randomUUID();

      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        reject(
          new Error(
            `Request "${type}" timed out after ${REQUEST_TIMEOUT_MS} ms`,
          ),
        );
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(messageId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.rawSend({ messageId, type, data });
    });
  }

  /**
   * Send a typed request that streams chunked responses.
   *
   * @param type     The message type.
   * @param data     Payload to send.
   * @param onChunk  Callback invoked for each streamed chunk.
   * @returns        Resolves when the final (`done: true`) chunk arrives.
   */
  stream(
    type: string,
    data: unknown,
    onChunk: (chunk: unknown) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const messageId = crypto.randomUUID();

      // Streaming requests use a longer timeout — 5 minutes.
      const timer = setTimeout(
        () => {
          this.streams.delete(messageId);
          reject(new Error(`Stream "${type}" timed out`));
        },
        5 * 60 * 1_000,
      );

      this.streams.set(messageId, { onChunk, resolve, reject, timer });

      this.rawSend({ messageId, type, data });
    });
  }

  /**
   * Subscribe to push messages of a given type.
   *
   * @param type     Message type to listen for.
   * @param handler  Callback receiving the push data.
   * @returns        Unsubscribe function.
   */
  on(type: string, handler: PushHandler): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  /**
   * Fire-and-forget: send a message without waiting for a response.
   *
   * @param type  Message type.
   * @param data  Payload.
   */
  send(type: string, data: unknown = {}): void {
    const messageId = crypto.randomUUID();
    this.rawSend({ messageId, type, data });
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Low-level send — serialises and writes to the socket. */
  private rawSend(message: WsMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected — cannot send message");
    }
    this.socket.send(JSON.stringify(message));
  }

  /** Route an inbound frame to the correct handler. */
  private handleMessage(event: MessageEvent): void {
    let response: WsResponse;
    try {
      response = JSON.parse(event.data as string) as WsResponse;
    } catch {
      console.warn("[ContinuumWS] Received unparseable message:", event.data);
      return;
    }

    const { messageId, type, data, error, streaming, done } = response;

    // 1) Streaming response
    if (streaming || done) {
      const stream = this.streams.get(messageId);
      if (stream) {
        if (error) {
          clearTimeout(stream.timer);
          this.streams.delete(messageId);
          stream.reject(new Error(error));
          return;
        }
        stream.onChunk(data);
        if (done) {
          clearTimeout(stream.timer);
          this.streams.delete(messageId);
          stream.resolve();
        }
        return;
      }
    }

    // 2) Correlated request/response
    const pending = this.pending.get(messageId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(messageId);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(data);
      }
      return;
    }

    // 3) Push message (server-initiated)
    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[ContinuumWS] Push handler error for "${type}":`, err);
        }
      }
    }
  }

  /** Update status and notify listeners. */
  private setStatus(status: WsConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error("[ContinuumWS] Status listener error:", err);
      }
    }
  }

  /** Schedule a reconnection attempt with exponential backoff. */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(this.backoff, MAX_BACKOFF_MS);
    console.info(`[ContinuumWS] Reconnecting in ${delay} ms…`);

    this.reconnectTimer = setTimeout(() => {
      this.backoff = Math.min(
        this.backoff * BACKOFF_MULTIPLIER,
        MAX_BACKOFF_MS,
      );
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Start periodic keepalive pings. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send("ping");
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Reject all pending requests and streams (e.g. on disconnect). */
  private rejectAllPending(reason: string): void {
    const error = new Error(reason);

    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(error);
      this.pending.delete(id);
    }

    for (const [id, stream] of this.streams) {
      clearTimeout(stream.timer);
      stream.reject(error);
      this.streams.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/** Global WebSocket client instance — import and use everywhere. */
export const ws = new ContinuumWS();
