import { WebIDE } from "../ide/WebIDE.js";
import { WebMessenger } from "./WebMessenger.js";
import type { WebSocketConnection } from "./handler.js";

import { Core } from "core/core.js";
import type { ToCoreProtocol, FromCoreProtocol } from "core/protocol/index.js";
import type { IMessenger, Message } from "core/protocol/messenger/index.js";
import type { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";

/**
 * A specialised messenger that handles IDE requests locally (via WebIDE)
 * instead of forwarding them to the WebSocket client.
 *
 * When Core calls messenger.request("getIdeInfo", ...) during construction,
 * this messenger answers directly from the WebIDE rather than sending over WS.
 */
class WebCoreMessenger implements IMessenger<ToCoreProtocol, FromCoreProtocol> {
  private myTypeListeners = new Map<
    keyof ToCoreProtocol,
    (message: Message) => any
  >();
  private pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (error: any) => void }
  >();
  private _onErrorHandlers: ((message: Message, error: Error) => void)[] = [];

  constructor(
    private ws: WebSocket,
    private webIde: WebIDE,
  ) {
    this.ws.on("message", (raw: Buffer | string) => {
      try {
        const msg: Message = JSON.parse(raw.toString());
        void this.handleIncoming(msg);
      } catch (error) {
        console.error("[WebCoreMessenger] Failed to parse message:", error);
      }
    });
  }

  onError(handler: (message: Message, error: Error) => void): void {
    this._onErrorHandlers.push(handler);
  }

  on<T extends keyof ToCoreProtocol>(
    messageType: T,
    handler: (
      message: Message<ToCoreProtocol[T][0]>,
    ) => Promise<ToCoreProtocol[T][1]> | ToCoreProtocol[T][1],
  ): void {
    this.myTypeListeners.set(messageType, handler);
  }

  send<T extends keyof FromCoreProtocol>(
    messageType: T,
    data: FromCoreProtocol[T][0],
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

  invoke<T extends keyof ToCoreProtocol>(
    messageType: T,
    data: ToCoreProtocol[T][0],
    messageId?: string,
  ): ToCoreProtocol[T][1] {
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
   * Handle requests FROM Core that need IDE responses.
   * Instead of sending to the WS client, we resolve them locally from WebIDE.
   */
  async request<T extends keyof FromCoreProtocol>(
    messageType: T,
    data: FromCoreProtocol[T][0],
  ): Promise<FromCoreProtocol[T][1]> {
    // Handle IDE-bound requests locally
    const localResult = await this.handleLocalRequest(
      messageType as string,
      data,
    );
    if (localResult !== undefined) {
      return localResult as FromCoreProtocol[T][1];
    }

    // Forward to WebSocket client for anything we can't handle locally
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

      setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          reject(new Error(`Request timed out: ${String(messageType)}`));
        }
      }, 30_000);
    });
  }

  /**
   * Handle IDE protocol requests locally using WebIDE.
   * Returns undefined if the request should be forwarded to the WS client.
   */
  private async handleLocalRequest(
    messageType: string,
    _data: any,
  ): Promise<any | undefined> {
    switch (messageType) {
      case "getIdeInfo":
        return this.webIde.getIdeInfo();
      case "getIdeSettings":
        return this.webIde.getIdeSettings();
      case "getWorkspaceDirs":
        return this.webIde.getWorkspaceDirs();
      case "getUniqueId":
        return this.webIde.getUniqueId();
      case "isTelemetryEnabled":
        return this.webIde.isTelemetryEnabled();
      case "isWorkspaceRemote":
        return this.webIde.isWorkspaceRemote();
      case "getDiff":
        return this.webIde.getDiff(_data?.includeUnstaged ?? false);
      case "readFile":
        return this.webIde.readFile(_data);
      case "writeFile":
        await this.webIde.writeFile(_data?.path, _data?.contents);
        return;
      case "listDir":
        return this.webIde.listDir(_data);
      case "getBranch":
        return this.webIde.getBranch(_data);
      case "getRepoName":
        return this.webIde.getRepoName(_data);
      case "getGitRootPath":
        return this.webIde.getGitRootPath(_data);
      case "fileExists":
        return this.webIde.fileExists(_data);
      case "readSecrets":
        return this.webIde.readSecrets(_data);
      case "writeSecrets":
        await this.webIde.writeSecrets(_data);
        return;
      case "showToast":
        return this.webIde.showToast(_data?.type, _data?.message);
      case "getOpenFiles":
        return this.webIde.getOpenFiles();
      case "getCurrentFile":
        return this.webIde.getCurrentFile();
      case "subprocess":
        return this.webIde.subprocess(_data?.command, _data?.cwd);
      case "getProblems":
        return this.webIde.getProblems(_data);
      case "getSearchResults":
        return this.webIde.getSearchResults(_data?.query, _data?.maxResults);
      case "getTerminalContents":
        return this.webIde.getTerminalContents();
      case "indexProgress":
        // Silently consume index progress notifications
        return undefined;
      default:
        // Not handled locally — will be forwarded to WS client
        return undefined;
    }
  }

  /**
   * Handle incoming messages from the WebSocket client.
   */
  private async handleIncoming(msg: Message): Promise<void> {
    // Check if it's a response to a pending request
    if (this.pendingRequests.has(msg.messageId)) {
      const pending = this.pendingRequests.get(msg.messageId)!;
      this.pendingRequests.delete(msg.messageId);
      pending.resolve(msg.data);
      return;
    }

    // Route to registered Core handler
    const listener = this.myTypeListeners.get(
      msg.messageType as keyof ToCoreProtocol,
    );
    if (!listener) {
      console.warn(`[WebCoreMessenger] No handler for: ${msg.messageType}`);
      return;
    }

    try {
      const result = await listener(msg);

      // Handle async generator responses (e.g. llm/streamChat)
      if (result && typeof result[Symbol.asyncIterator] === "function") {
        let next = await result.next();
        while (!next.done) {
          const streamResponse: Message = {
            messageType: msg.messageType,
            data: { done: false, content: next.value, status: "success" },
            messageId: msg.messageId,
          };
          if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(streamResponse));
          }
          next = await result.next();
        }
        // Final message
        const finalResponse: Message = {
          messageType: msg.messageType,
          data: { done: true, content: next.value, status: "success" },
          messageId: msg.messageId,
        };
        if (this.ws.readyState === this.ws.OPEN) {
          this.ws.send(JSON.stringify(finalResponse));
        }
      } else {
        // Regular response — wrap in WebviewSingleMessage format
        const response: Message = {
          messageType: msg.messageType,
          data: { done: true, content: result, status: "success" },
          messageId: msg.messageId,
        };
        if (this.ws.readyState === this.ws.OPEN) {
          this.ws.send(JSON.stringify(response));
        }
      }
    } catch (error) {
      console.error(
        `[WebCoreMessenger] Error handling ${msg.messageType}:`,
        error,
      );
      const errorResponse: Message = {
        messageType: msg.messageType,
        data: { done: true, error: (error as Error).message, status: "error" },
        messageId: msg.messageId,
      };
      if (this.ws.readyState === this.ws.OPEN) {
        this.ws.send(JSON.stringify(errorResponse));
      }
    }
  }

  dispose(): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();
    this.myTypeListeners.clear();
  }
}

/**
 * Manages Core engine instances for WebSocket connections.
 *
 * Each connected client gets its own Core instance, wired to a
 * WebCoreMessenger for that connection. The WebIDE is shared across
 * all connections (same filesystem).
 */
export class CoreManager {
  private cores = new Map<
    string,
    { core: Core; messenger: WebCoreMessenger }
  >();
  private webIde: WebIDE;

  constructor(workspaceDirs: string[]) {
    this.webIde = new WebIDE(workspaceDirs);
  }

  /**
   * Bootstrap a Core instance for a new WebSocket connection.
   */
  async createCore(conn: WebSocketConnection): Promise<Core> {
    const messenger = new WebCoreMessenger(conn.ws, this.webIde);

    // Create the Core instance — this triggers initialisation
    const core = new Core(messenger, this.webIde);
    this.cores.set(conn.id, { core, messenger });

    // Load config after core is created
    try {
      await core.configHandler.loadConfig();
    } catch (error) {
      console.warn("[CoreManager] Config load warning:", error);
    }

    console.log(`[CoreManager] Core instance created for ${conn.id}`);
    return core;
  }

  /**
   * Remove a Core instance when a client disconnects.
   */
  removeCore(connectionId: string): void {
    const entry = this.cores.get(connectionId);
    if (entry) {
      entry.messenger.dispose();
      this.cores.delete(connectionId);
      console.log(`[CoreManager] Core removed for ${connectionId}`);
    }
  }

  /**
   * Get a Core instance by connection ID.
   */
  getCore(connectionId: string): Core | undefined {
    return this.cores.get(connectionId)?.core;
  }
}
