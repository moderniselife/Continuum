import { randomUUID } from "crypto";
import { WebIDE } from "../ide/WebIDE.js";
import { WebMessenger } from "./WebMessenger.js";
import type { WebSocketConnection } from "./handler.js";

import { Core } from "core/core.js";
import type { ConfigHandler } from "core/config/ConfigHandler.js";
import type { ToCoreProtocol, FromCoreProtocol } from "core/protocol/index.js";
import type { ChatMessage, Tool, ToolCall, ToolCallDelta } from "core/index.js";
import { callTool } from "core/tools/callTool.js";
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
  private _configHandler: ConfigHandler | null = null;

  // Map of pending tool approval requests: toolCallId -> resolver
  private pendingToolApprovals = new Map<
    string,
    { resolve: (approved: boolean) => void }
  >();

  constructor(
    private ws: WebSocket,
    private webIde: WebIDE,
  ) {
    this.ws.on("message", (raw: Buffer | string) => {
      try {
        const parsed = JSON.parse(raw.toString());
        // Normalise: frontend sends { type } but Core expects { messageType }
        const msg: Message = {
          messageType: parsed.messageType ?? parsed.type,
          messageId: parsed.messageId,
          data: parsed.data,
        };
        void this.handleIncoming(msg);
      } catch (error) {
        console.error("[WebCoreMessenger] Failed to parse message:", error);
      }
    });
  }

  /**
   * Wait for the client to approve or reject a tool call.
   * Returns true if approved, false if rejected.
   * Auto-approves after 120 seconds to prevent deadlocks.
   */
  private waitForToolApproval(toolCallId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.pendingToolApprovals.set(toolCallId, { resolve });

      // Auto-approve after 120s to prevent infinite waits
      setTimeout(() => {
        if (this.pendingToolApprovals.has(toolCallId)) {
          console.warn(
            `[WebCoreMessenger] Tool approval timeout for ${toolCallId}, auto-approving`,
          );
          this.pendingToolApprovals.delete(toolCallId);
          resolve(true);
        }
      }, 120_000);
    });
  }

  /**
   * Handle an incoming tool/approve message from the client.
   */
  private handleToolApproval(toolCallId: string, approved: boolean): void {
    const pending = this.pendingToolApprovals.get(toolCallId);
    if (pending) {
      this.pendingToolApprovals.delete(toolCallId);
      pending.resolve(approved);
      console.info(
        `[WebCoreMessenger] Tool ${toolCallId} ${approved ? "approved" : "rejected"} by user`,
      );
    }
  }

  onError(handler: (message: Message, error: Error) => void): void {
    this._onErrorHandlers.push(handler);
  }

  /**
   * Set the config handler. Called after Core is constructed, since the
   * messenger must exist before Core but configHandler comes from Core.
   */
  setConfigHandler(handler: ConfigHandler): void {
    this._configHandler = handler;
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
    // Send with `type` (not `messageType`) to match frontend WsResponse format
    const payload = {
      type: messageType as string,
      data,
      messageId: id,
    };
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(payload));
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

  // Sentinel value to distinguish "handled locally, result is void/undefined"
  // from "not handled locally" (which returns the JS `undefined`).
  private static readonly LOCAL_HANDLED = Symbol("LOCAL_HANDLED");

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
      // LOCAL_HANDLED sentinel means "we consumed it, return undefined"
      if (localResult === WebCoreMessenger.LOCAL_HANDLED) {
        return undefined as any;
      }
      return localResult as FromCoreProtocol[T][1];
    }

    // Forward to WebSocket client for anything we can't handle locally
    return new Promise((resolve, _reject) => {
      const messageId = uuidv4();
      this.pendingRequests.set(messageId, {
        resolve,
        reject: (err) => {
          // Resolve with undefined instead of rejecting to prevent crash
          console.warn(`[WebCoreMessenger] ${err.message}`);
          resolve(undefined as any);
        },
      });

      const msg = {
        type: messageType as string,
        data,
        messageId,
      };

      if (this.ws.readyState === this.ws.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.pendingRequests.delete(messageId);
        console.warn(
          `[WebCoreMessenger] WS closed, skipping: ${String(messageType)}`,
        );
        resolve(undefined as any);
      }

      setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          console.debug(
            `[WebCoreMessenger] Request timed out: ${String(messageType)}`,
          );
          resolve(undefined as any);
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
        return WebCoreMessenger.LOCAL_HANDLED;
      case "configUpdate":
      case "refreshSubmenuItems":
      case "setTTSActive":
      case "focusContinueInput":
      case "focusContinueInputWithoutClear":
      case "highlightedCode":
        // Push messages from Core → forward to GUI via WS
        return WebCoreMessenger.LOCAL_HANDLED;
      default:
        // Not handled locally — will be forwarded to WS client
        return undefined;
    }
  }

  /**
   * Handle incoming messages from the WebSocket client.
   */
  /**
   * Send a response to the frontend WebSocket client in the format it expects:
   * `{ messageId, type, data, streaming?, done?, error? }`
   */
  private sendToClient(envelope: {
    messageType: string;
    messageId: string;
    data: unknown;
    streaming?: boolean;
    done?: boolean;
    error?: string;
  }): void {
    if (this.ws.readyState !== this.ws.OPEN) return;

    // Map Core's `messageType` → frontend's `type`
    const payload: Record<string, unknown> = {
      messageId: envelope.messageId,
      type: envelope.messageType,
      data: envelope.data,
    };
    if (envelope.streaming !== undefined)
      payload.streaming = envelope.streaming;
    if (envelope.done !== undefined) payload.done = envelope.done;
    if (envelope.error !== undefined) payload.error = envelope.error;

    this.ws.send(JSON.stringify(payload));
  }

  private async handleIncoming(msg: Message): Promise<void> {
    // Check if it's a response to a pending request
    if (this.pendingRequests.has(msg.messageId)) {
      const pending = this.pendingRequests.get(msg.messageId)!;
      this.pendingRequests.delete(msg.messageId);
      pending.resolve(msg.data);
      return;
    }

    // -----------------------------------------------------------------------
    // Intercept ping messages — Core expects msg.data === "ping"
    // -----------------------------------------------------------------------
    if (msg.messageType === "ping") {
      msg.data = "ping";
      // Fall through to the generic handler which will route to Core's on("ping")
    }

    // -----------------------------------------------------------------------
    // Handle tool approval responses from the client
    // -----------------------------------------------------------------------
    if (msg.messageType === "tool/approve") {
      const { toolCallId, approved } = msg.data as {
        toolCallId: string;
        approved: boolean;
      };
      this.handleToolApproval(toolCallId, approved);
      return;
    }

    // -----------------------------------------------------------------------
    // Server-side agent loop for "chat/send"
    //
    // Translates the Web IDE chat payload → Core "llm/streamChat", then runs
    // an agentic loop: stream the LLM response, detect tool calls, execute
    // them via WebIDE, append results, and re-invoke — up to MAX_ITERATIONS.
    // -----------------------------------------------------------------------
    if (msg.messageType === "chat/send") {
      const chatPayload = msg.data as {
        message?: { content?: string; context?: unknown[] };
        sessionId?: string;
        mode?: string;
        modelId?: string;
        allowAutoApply?: boolean;
      };

      const userContent = chatPayload?.message?.content ?? "";
      const contextItems = (chatPayload?.message?.context ?? []) as Array<{
        id?: string;
        name?: string;
        type?: string;
        content?: string;
      }>;

      // Load config and gather enabled tools
      let tools: Tool[] = [];
      try {
        if (this._configHandler) {
          const { config } = await this._configHandler.loadConfig();
          tools = config?.tools ?? [];
        }
      } catch (err) {
        console.warn(
          "[WebCoreMessenger] Could not load tools from config:",
          err,
        );
      }

      const conversationHistory: ChatMessage[] = [];

      if (contextItems && contextItems.length > 0) {
        const contextContent = contextItems
          .map((item) => {
            const name = item.name || "Unknown";
            return `File: ${name}\n\`\`\`\n${item.content || ""}\n\`\`\``;
          })
          .join("\n\n");
        conversationHistory.push({
          role: "system" as const,
          content: `The user has attached the following files as context:\n\n${contextContent}`,
        });
      }

      conversationHistory.push({
        role: "user" as const,
        content: userContent,
      });

      const MAX_ITERATIONS = 50;
      let iteration = 0;

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        // Build the llm/streamChat message
        const streamMsg: Message = {
          messageType: "llm/streamChat",
          messageId: msg.messageId,
          data: {
            messages: conversationHistory,
            completionOptions: {
              tools: tools.length > 0 ? tools : undefined,
            },
          },
        };

        // Retrieve the registered handler for llm/streamChat
        const listener = this.myTypeListeners.get("llm/streamChat");
        if (!listener) {
          console.warn(
            "[WebCoreMessenger] No llm/streamChat handler registered",
          );
          break;
        }

        let accumulatedContent = "";
        let accumulatedToolCalls: ToolCallDelta[] = [];

        try {
          const result = await listener(streamMsg);

          // Stream async generator chunks to the client
          if (result && typeof result[Symbol.asyncIterator] === "function") {
            let next = await result.next();
            while (!next.done) {
              const chunk = next.value as ChatMessage;

              // Stream content deltas to the frontend
              if (chunk.content) {
                const contentStr =
                  typeof chunk.content === "string"
                    ? chunk.content
                    : chunk.content
                        .filter((p: { type: string }) => p.type === "text")
                        .map(
                          (p: { type: string; text?: string }) => p.text ?? "",
                        )
                        .join("");

                if (contentStr) {
                  accumulatedContent += contentStr;
                  this.sendToClient({
                    messageType: "chat/send",
                    messageId: msg.messageId,
                    data: { content: contentStr },
                    streaming: true,
                    done: false,
                  });
                }
              }

              // Merge tool call deltas — LLM providers stream arguments
              // as partial JSON fragments across multiple chunks. We need
              // to concatenate them by tool call ID, not replace.
              if (
                "toolCalls" in chunk &&
                chunk.toolCalls &&
                chunk.toolCalls.length > 0
              ) {
                for (const delta of chunk.toolCalls) {
                  const idx = accumulatedToolCalls.findIndex(
                    (tc) => tc.id && tc.id === delta.id,
                  );
                  if (idx >= 0) {
                    // Existing tool call — append arguments fragment
                    const existing = accumulatedToolCalls[idx];
                    if (delta.function?.arguments) {
                      existing.function = existing.function ?? {};
                      existing.function.arguments =
                        (existing.function.arguments ?? "") +
                        delta.function.arguments;
                    }
                    // Update name if provided (usually only on first delta)
                    if (delta.function?.name) {
                      existing.function = existing.function ?? {};
                      existing.function.name = delta.function.name;
                    }
                  } else {
                    // New tool call — add to accumulator
                    accumulatedToolCalls.push({
                      id: delta.id,
                      type: delta.type ?? "function",
                      function: {
                        name: delta.function?.name ?? "",
                        arguments: delta.function?.arguments ?? "",
                      },
                    });
                  }
                }
              }

              next = await result.next();
            }
          }
        } catch (err) {
          console.error("[WebCoreMessenger] Error during llm/streamChat:", err);
          this.sendToClient({
            messageType: "chat/send",
            messageId: msg.messageId,
            data: null,
            done: true,
            error: (err as Error).message,
          });
          return;
        }

        // Append the assistant's response to the conversation history
        const assistantMsg: ChatMessage = {
          role: "assistant" as const,
          content: accumulatedContent,
          ...(accumulatedToolCalls.length > 0 && {
            toolCalls: accumulatedToolCalls,
          }),
        };
        conversationHistory.push(assistantMsg);

        // If no tool calls, we're finished — break out of the loop
        if (accumulatedToolCalls.length === 0) {
          break;
        }

        // Execute each tool call and feed results back into history
        const isYoloMode = msg.data?.allowAutoApply === true;
        for (const tc of accumulatedToolCalls) {
          const toolName = tc.function?.name ?? "unknown";
          const toolCallId = tc.id || randomUUID();
          let rawArgs = tc.function?.arguments ?? "{}";

          console.info(
            `[WebCoreMessenger] Tool call: ${toolName} (id: ${toolCallId})`,
          );

          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs = JSON.parse(rawArgs);
          } catch {
            // If args can't be parsed, still show the tool call
          }

          // Non-YOLO mode: send pending status for write tools and wait for approval
          const writeTools = [
            "writeFile",
            "write_file",
            "createNewFile",
            "create_new_file",
            "editFile",
            "edit_file",
            "multi_edit",
            "str_replace_editor",
            "replace_in_file",
            "insert_code_block",
            "runTerminalCommand",
            "run_terminal_command",
            "run_command",
            "subprocess",
          ];
          const requiresApproval = !isYoloMode && writeTools.includes(toolName);

          if (requiresApproval) {
            // Send pending status — frontend shows Approve/Reject buttons
            this.sendToClient({
              messageType: "chat/send",
              messageId: msg.messageId,
              data: {
                toolCall: {
                  id: toolCallId,
                  toolName,
                  args: rawArgs,
                  status: "pending",
                },
              },
              streaming: true,
              done: false,
            });

            // Wait for approval from the client
            const approved = await this.waitForToolApproval(toolCallId);
            if (!approved) {
              // Rejected — notify frontend and skip this tool
              this.sendToClient({
                messageType: "chat/send",
                messageId: msg.messageId,
                data: {
                  toolCall: {
                    id: toolCallId,
                    toolName,
                    args: rawArgs,
                    status: "error",
                    output: "Tool call rejected by user.",
                  },
                },
                streaming: true,
                done: false,
              });
              conversationHistory.push({
                role: "tool" as const,
                content:
                  "Tool call was rejected by the user. Do not retry this exact call.",
                toolCallId,
              });
              continue;
            }
          }

          // Notify frontend: tool call is running
          this.sendToClient({
            messageType: "chat/send",
            messageId: msg.messageId,
            data: {
              toolCall: {
                id: toolCallId,
                toolName,
                args: rawArgs,
                status: "running",
              },
            },
            streaming: true,
            done: false,
          });

          let toolOutput = "";
          let toolStatus: "completed" | "error" = "completed";

          try {
            toolOutput = await this.executeTool(toolName, parsedArgs, tools);
          } catch (err) {
            toolOutput = `Error executing tool '${toolName}': ${(err as Error).message}`;
            toolStatus = "error";
            console.error(
              `[WebCoreMessenger] Tool execution failed: ${toolName}`,
              err,
            );
          }

          // Notify frontend: tool call completed or errored
          this.sendToClient({
            messageType: "chat/send",
            messageId: msg.messageId,
            data: {
              toolCall: {
                id: toolCallId,
                toolName,
                args: rawArgs,
                status: toolStatus,
                output: toolOutput,
              },
            },
            streaming: true,
            done: false,
          });

          // Append tool result to conversation history
          conversationHistory.push({
            role: "tool" as const,
            content: toolOutput,
            toolCallId,
          });
        }

        // Notify frontend that the AI is thinking again before next iteration
        this.sendToClient({
          messageType: "chat/send",
          messageId: msg.messageId,
          data: { thinking: true },
          streaming: true,
          done: false,
        });

        // Loop continues — will re-invoke streamChat with updated history
        console.info(
          `[WebCoreMessenger] Agent loop iteration ${iteration} complete, re-invoking LLM`,
        );
      }

      if (iteration >= MAX_ITERATIONS) {
        console.warn(
          `[WebCoreMessenger] Agent loop hit maximum iterations (${MAX_ITERATIONS})`,
        );
      }

      // Send the final "done" message
      this.sendToClient({
        messageType: "chat/send",
        messageId: msg.messageId,
        data: { done: true },
        done: true,
      });

      return; // Don't fall through to the generic handler
    }

    // Route to registered Core handler
    const listener = this.myTypeListeners.get(
      msg.messageType as keyof ToCoreProtocol,
    );
    if (!listener) {
      console.debug(`[WebCoreMessenger] No handler for: ${msg.messageType}`);
      return;
    }

    try {
      const result = await listener(msg);

      // Handle async generator responses (e.g. llm/streamChat)
      if (result && typeof result[Symbol.asyncIterator] === "function") {
        let next = await result.next();
        while (!next.done) {
          this.sendToClient({
            messageType: msg.messageType,
            messageId: msg.messageId,
            data: next.value,
            streaming: true,
            done: false,
          });
          next = await result.next();
        }
        // Final message
        this.sendToClient({
          messageType: msg.messageType,
          messageId: msg.messageId,
          data: next.value,
          done: true,
        });
      } else {
        // Regular response
        this.sendToClient({
          messageType: msg.messageType,
          messageId: msg.messageId,
          data: result,
          done: true,
        });
      }
    } catch (error) {
      console.error(
        `[WebCoreMessenger] Error handling ${msg.messageType}:`,
        error,
      );
      this.sendToClient({
        messageType: msg.messageType,
        messageId: msg.messageId,
        data: null,
        done: true,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Execute a tool call by dispatching to the appropriate WebIDE method.
   *
   * Supports the core built-in tools; unsupported tools return a descriptive
   * message rather than throwing, so the LLM can recover gracefully.
   */
  private async executeTool(
    toolName: string,
    args: Record<string, any>,
    loadedTools?: Tool[],
  ): Promise<string> {
    // Check if this is an MCP tool (has a URI) — delegate to Core's callTool
    if (loadedTools) {
      const matchingTool = loadedTools.find(
        (t) => t.function?.name === toolName,
      );
      if (matchingTool?.uri) {
        console.info(
          `[WebCoreMessenger] Executing MCP tool via Core: ${toolName}`,
        );
        const toolCall: ToolCall = {
          id: randomUUID(),
          type: "function" as const,
          function: {
            name: toolName,
            arguments: JSON.stringify(args),
          },
        };
        const result = await callTool(matchingTool, toolCall, {
          ide: this.webIde,
          fetch: globalThis.fetch,
          config: (await this._configHandler?.loadConfig())?.config,
        } as any);
        if (result.errorMessage) {
          throw new Error(result.errorMessage);
        }
        return (
          result.contextItems.map((item) => item.content).join("\n") ||
          "(no output)"
        );
      }
    }

    // Built-in tool execution via WebIDE
    switch (toolName) {
      case "readFile":
      case "read_file": {
        const filePath = args.filepath ?? args.path ?? args.file;
        return await this.webIde.readFile(filePath);
      }

      case "readFileRange":
      case "read_file_range": {
        const filePath = args.filepath ?? args.path ?? args.file;
        const startLine = args.startLine ?? args.start_line ?? args.start ?? 1;
        const endLine = args.endLine ?? args.end_line ?? args.end ?? undefined;
        const content = await this.webIde.readFile(filePath);
        const lines = content.split("\n");
        const start = Math.max(1, startLine) - 1;
        const end = endLine ? Math.min(lines.length, endLine) : lines.length;
        const slice = lines.slice(start, end);
        // Return with line numbers for context
        return slice.map((line, i) => `${start + i + 1}: ${line}`).join("\n");
      }

      case "createNewFile":
      case "create_new_file":
      case "writeFile":
      case "write_file": {
        const filePath = args.filepath ?? args.path ?? args.file;
        const contents = args.contents ?? args.content ?? "";
        await this.webIde.writeFile(filePath, contents);
        return "File written successfully.";
      }

      case "editFile":
      case "edit_file": {
        const filePath = args.filepath ?? args.path ?? args.file;
        const contents = args.contents ?? args.content ?? "";
        await this.webIde.writeFile(filePath, contents);
        return "File edited successfully.";
      }

      case "multi_edit":
      case "multiEdit": {
        // Structured multi-edit: apply multiple find/replace edits to a file
        const filePath = args.filepath ?? args.path ?? args.file;
        const edits: Array<{
          old_string?: string;
          new_string?: string;
          oldStr?: string;
          newStr?: string;
        }> = args.edits ?? args.changes ?? [];
        if (!filePath) return "Error: no file path specified.";

        let content = await this.webIde.readFile(filePath);
        let appliedCount = 0;

        for (const edit of edits) {
          const oldStr = edit.old_string ?? edit.oldStr ?? "";
          const newStr = edit.new_string ?? edit.newStr ?? "";
          if (!oldStr) continue;
          if (content.includes(oldStr)) {
            content = content.replace(oldStr, newStr);
            appliedCount++;
          } else {
            console.warn(
              `[multi_edit] Could not find target string in ${filePath}:\n${oldStr.slice(0, 100)}...`,
            );
          }
        }

        await this.webIde.writeFile(filePath, content);
        return `Applied ${appliedCount}/${edits.length} edits to ${filePath}.`;
      }

      case "str_replace_editor":
      case "replace_in_file": {
        // Single find/replace edit — common in Claude tool use
        const filePath = args.filepath ?? args.path ?? args.file;
        const oldStr = args.old_str ?? args.old_string ?? args.search ?? "";
        const newStr = args.new_str ?? args.new_string ?? args.replace ?? "";
        const command = args.command ?? "str_replace";

        if (command === "view") {
          // View mode — just read the file
          return await this.webIde.readFile(filePath);
        }

        if (command === "create") {
          // Create mode — write new file
          const contents = args.file_text ?? args.content ?? "";
          await this.webIde.writeFile(filePath, contents);
          return `File created: ${filePath}`;
        }

        if (!filePath) return "Error: no file path specified.";
        let content = await this.webIde.readFile(filePath);

        if (!oldStr) {
          // If no old_str, treat as a full file replacement
          await this.webIde.writeFile(filePath, newStr);
          return "File replaced successfully.";
        }

        if (!content.includes(oldStr)) {
          return `Error: Could not find the specified text in ${filePath}. Make sure the old_str matches exactly, including whitespace and indentation.`;
        }

        content = content.replace(oldStr, newStr);
        await this.webIde.writeFile(filePath, content);
        return `Successfully replaced text in ${filePath}.`;
      }

      case "insert_code_block":
      case "insertCodeBlock": {
        const filePath = args.filepath ?? args.path ?? args.file;
        const code = args.code ?? args.content ?? args.text ?? "";
        const line = args.line ?? args.lineNumber ?? args.at;
        if (!filePath) return "Error: no file path specified.";

        let content = await this.webIde.readFile(filePath);
        const lines = content.split("\n");

        if (line !== undefined) {
          // Insert at specific line number
          const insertAt = Math.max(0, Math.min(lines.length, line - 1));
          lines.splice(insertAt, 0, code);
        } else {
          // Append to end
          lines.push(code);
        }

        await this.webIde.writeFile(filePath, lines.join("\n"));
        return `Code inserted into ${filePath}.`;
      }

      case "runTerminalCommand":
      case "run_terminal_command":
      case "run_command":
      case "subprocess": {
        const command = args.command ?? args.cmd ?? "";
        const cwd = args.cwd ?? undefined;
        const [stdout, stderr] = await this.webIde.subprocess(command, cwd);
        if (stderr) {
          return `stdout:\n${stdout}\nstderr:\n${stderr}`;
        }
        return stdout || "(no output)";
      }

      case "listDir":
      case "list_dir":
      case "ls": {
        const dir = args.path ?? args.dir ?? args.directory ?? ".";
        const entries = await this.webIde.listDir(dir);
        return entries
          .map(([name, type]) => `${type === 2 ? "[dir] " : ""}${name}`)
          .join("\n");
      }

      case "searchFiles":
      case "search_files":
      case "grep_search":
      case "grepSearch":
      case "codebase": {
        const query = args.query ?? args.pattern ?? args.search ?? "";
        const maxResults = args.maxResults ?? 50;
        return await this.webIde.getSearchResults(query, maxResults);
      }

      case "glob_search":
      case "globSearch":
      case "file_glob_search":
      case "fileGlobSearch":
      case "find_files": {
        const pattern = args.pattern ?? args.glob ?? "*";
        const maxResults = args.maxResults ?? 100;
        return await this.webIde.getFileResults(pattern, maxResults);
      }

      case "getDiff":
      case "get_diff":
      case "viewDiff":
      case "view_diff": {
        const includeUnstaged = args.includeUnstaged ?? true;
        const diffs = await this.webIde.getDiff(includeUnstaged);
        return diffs.join("\n---\n") || "(no diff)";
      }

      case "fileExists":
      case "file_exists": {
        const filePath = args.filepath ?? args.path ?? args.file;
        const exists = await this.webIde.fileExists(filePath);
        return exists ? "true" : "false";
      }

      default:
        return `Tool '${toolName}' is not yet supported in the Web IDE. Available tools: readFile, readFileRange, writeFile, editFile, multi_edit, str_replace_editor, insert_code_block, runTerminalCommand, listDir, searchFiles, codebase, globSearch, file_glob_search, getDiff, fileExists.`;
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

  /**
   * @param webIde - Shared WebIDE instance, created externally so it can
   *                 be reused by the REST file routes and other services.
   */
  constructor(webIde: WebIDE) {
    this.webIde = webIde;
  }

  /**
   * Bootstrap a Core instance for a new WebSocket connection.
   */
  async createCore(conn: WebSocketConnection): Promise<Core> {
    const messenger = new WebCoreMessenger(conn.ws, this.webIde);

    // Create the Core instance — this triggers initialisation
    const core = new Core(messenger, this.webIde);

    // Wire up the config handler so the messenger can load tools
    messenger.setConfigHandler(core.configHandler);

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
