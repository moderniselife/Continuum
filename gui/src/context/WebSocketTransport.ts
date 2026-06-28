/**
 * WebSocket transport for the Continuum GUI.
 *
 * When running in web mode (served by the Continuum Web Server), this replaces
 * the VS Code postMessage transport. Messages are sent over WebSocket and
 * responses are dispatched as synthetic "message" events on the window, so the
 * existing IdeMessenger code works without modification.
 */

import type { Message } from "core/protocol/messenger";

export function isWebMode(): boolean {
  return !!(window as any).__CONTINUUM_WEB__;
}

/**
 * Creates and manages a WebSocket connection to the Continuum Web Server.
 * Incoming messages are dispatched as window "message" events to integrate
 * seamlessly with the existing IdeMessenger event listener pattern.
 */
export class WebSocketTransport {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private messageQueue: string[] = [];
  private isConnected = false;

  constructor() {
    this.connect();
  }

  private getWsUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = (window as any).__CONTINUUM_TOKEN__;
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    return `${protocol}//${window.location.host}/ws${tokenParam}`;
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.getWsUrl());

      this.ws.onopen = () => {
        console.log("[Continuum WS] Connected");
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // Flush queued messages
        for (const msg of this.messageQueue) {
          this.ws?.send(msg);
        }
        this.messageQueue = [];
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          // Dispatch as a window "message" event so IdeMessenger's existing
          // event handlers pick it up seamlessly
          window.dispatchEvent(new MessageEvent("message", { data: msg }));
        } catch (error) {
          console.error("[Continuum WS] Failed to parse message:", error);
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.log(`[Continuum WS] Disconnected (code: ${event.code})`);
        this.isConnected = false;
        this.attemptReconnect();
      };

      this.ws.onerror = (error: Event) => {
        console.error("[Continuum WS] Error:", error);
      };
    } catch (error) {
      console.error("[Continuum WS] Failed to connect:", error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        "[Continuum WS] Max reconnect attempts reached. Please refresh the page.",
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
    console.log(
      `[Continuum WS] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})...`,
    );

    setTimeout(() => this.connect(), delay);
  }

  /**
   * Send a message over the WebSocket. If not connected, queues the message.
   */
  postMessage(msg: Message): void {
    const data = JSON.stringify(msg);

    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.messageQueue.push(data);
    }
  }

  /**
   * Close the WebSocket connection.
   */
  dispose(): void {
    this.maxReconnectAttempts = 0; // Prevent reconnection
    this.ws?.close();
  }
}

// Singleton instance — created once when in web mode
let _transport: WebSocketTransport | null = null;

export function getWebSocketTransport(): WebSocketTransport {
  if (!_transport) {
    _transport = new WebSocketTransport();
  }
  return _transport;
}
