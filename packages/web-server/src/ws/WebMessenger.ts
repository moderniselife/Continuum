import { v4 as uuidv4 } from "uuid";
import type { WebSocket } from "ws";

import type { IProtocol } from "core/protocol/index.js";
import type { IMessenger, Message } from "core/protocol/messenger/index.js";

/**
 * WebMessenger — implements Core's IMessenger interface over WebSocket.
 *
 * This bridges the Core engine to a WebSocket-connected client (browser GUI or API consumer).
 * It handles:
 * - Routing protocol messages between Core and the WebSocket client
 * - Request/response correlation via messageId
 * - Streaming responses via chunked WebSocket frames
 */
export class WebMessenger<
  ToProtocol extends IProtocol,
  FromProtocol extends IProtocol,
> implements IMessenger<ToProtocol, FromProtocol>
{
  private myTypeListeners = new Map<
    keyof ToProtocol,
    (message: Message) => any
  >();

  private pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (error: any) => void }
  >();

  private _onErrorHandlers: ((message: Message, error: Error) => void)[] = [];

  constructor(private ws: WebSocket) {
    this.ws.on("message", (raw: Buffer | string) => {
      try {
        const msg: Message = JSON.parse(raw.toString());
        this.handleIncoming(msg);
      } catch (error) {
        console.error("[WebMessenger] Failed to parse message:", error);
      }
    });
  }

  onError(handler: (message: Message, error: Error) => void): void {
    this._onErrorHandlers.push(handler);
  }

  /**
   * Register a handler for incoming messages of a given type.
   * Called by Core to set up its protocol handlers.
   */
  on<T extends keyof ToProtocol>(
    messageType: T,
    handler: (
      message: Message<ToProtocol[T][0]>,
    ) => Promise<ToProtocol[T][1]> | ToProtocol[T][1],
  ): void {
    this.myTypeListeners.set(messageType, handler);
  }

  /**
   * Send a message from Core to the client (fire-and-forget).
   */
  send<T extends keyof FromProtocol>(
    messageType: T,
    data: FromProtocol[T][0],
    messageId?: string,
  ): string {
    const id = messageId ?? uuidv4();
    const msg: Message = {
      messageType: messageType as string,
      data,
      messageId: id,
    };

    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }

    return id;
  }

  /**
   * Invoke a handler synchronously (used by Core internally).
   */
  invoke<T extends keyof ToProtocol>(
    messageType: T,
    data: ToProtocol[T][0],
    messageId?: string,
  ): ToProtocol[T][1] {
    const listener = this.myTypeListeners.get(messageType);
    if (!listener) return undefined as any;

    const msg: Message = {
      messageType: messageType as string,
      data,
      messageId: messageId ?? uuidv4(),
    };

    try {
      return listener(msg);
    } catch (error) {
      for (const handler of this._onErrorHandlers) {
        handler(msg, error as Error);
      }
      throw error;
    }
  }

  /**
   * Send a request to the client and wait for a response.
   * Used when Core needs information from the IDE/GUI.
   */
  request<T extends keyof FromProtocol>(
    messageType: T,
    data: FromProtocol[T][0],
  ): Promise<FromProtocol[T][1]> {
    return new Promise((resolve, reject) => {
      const messageId = uuidv4();
      this.pendingRequests.set(messageId, { resolve, reject });

      const msg: Message = {
        messageType: messageType as string,
        data,
        messageId,
      };

      if (this.ws.readyState === this.ws.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        reject(new Error("WebSocket is not open"));
        this.pendingRequests.delete(messageId);
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          reject(new Error(`Request timed out: ${String(messageType)}`));
        }
      }, 30_000);
    });
  }

  /**
   * Handle an incoming message from the WebSocket client.
   */
  private async handleIncoming(msg: Message): Promise<void> {
    // Check if it's a response to a pending request
    if (this.pendingRequests.has(msg.messageId)) {
      const pending = this.pendingRequests.get(msg.messageId)!;
      this.pendingRequests.delete(msg.messageId);
      pending.resolve(msg.data);
      return;
    }

    // Otherwise, route to the registered handler
    const listener = this.myTypeListeners.get(
      msg.messageType as keyof ToProtocol,
    );
    if (!listener) {
      console.warn(
        `[WebMessenger] No handler for message type: ${msg.messageType}`,
      );
      return;
    }

    try {
      const result = await listener(msg);

      // Send response back to client
      if (result !== undefined) {
        const response: Message = {
          messageType: msg.messageType,
          data: result,
          messageId: msg.messageId,
        };
        if (this.ws.readyState === this.ws.OPEN) {
          this.ws.send(JSON.stringify(response));
        }
      }
    } catch (error) {
      console.error(`[WebMessenger] Error handling ${msg.messageType}:`, error);
      for (const handler of this._onErrorHandlers) {
        handler(msg, error as Error);
      }

      // Send error response
      const errorResponse: Message = {
        messageType: msg.messageType,
        data: { error: (error as Error).message },
        messageId: msg.messageId,
      };
      if (this.ws.readyState === this.ws.OPEN) {
        this.ws.send(JSON.stringify(errorResponse));
      }
    }
  }

  /**
   * Clean up when the connection closes.
   */
  dispose(): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();
    this.myTypeListeners.clear();
  }
}
