/**
 * Continuum Web IDE — Protocol Types
 *
 * Shared TypeScript definitions for the WebSocket and REST protocol.
 * All shapes consumed by the API layer and Zustand stores live here.
 *
 * @module api/types
 */

// ---------------------------------------------------------------------------
// WebSocket protocol
// ---------------------------------------------------------------------------

/** Chat interaction modes supported by the server. */
export type ChatMode = "chat" | "agent" | "plan" | "background";

/** Outbound WebSocket message envelope. */
export interface WsMessage<T = unknown> {
  /** Unique identifier used to correlate request → response. */
  messageId: string;
  /** Message type discriminator (e.g. "chat/send", "session/list"). */
  type: string;
  /** Payload data — shape depends on `type`. */
  data: T;
}

/** Inbound WebSocket response envelope. */
export interface WsResponse<T = unknown> {
  /** Correlating message ID from the original request. */
  messageId: string;
  /** Response type discriminator. */
  type: string;
  /** `true` when this is a streaming chunk (not the final response). */
  streaming?: boolean;
  /** Marks the final chunk in a streaming sequence. */
  done?: boolean;
  /** Payload data — shape depends on `type`. */
  data: T;
  /** Server-side error, if any. */
  error?: string;
}

/** Events the WebSocket client can be in. */
export type WsConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

// ---------------------------------------------------------------------------
// Context items & tool calls
// ---------------------------------------------------------------------------

/** A piece of context attached to a chat message (file, selection, etc.). */
export interface ContextItem {
  /** Machine-readable identifier (e.g. filepath, URL). */
  id: string;
  /** Human-readable label shown in the UI. */
  name: string;
  /** Type discriminator — "file", "selection", "url", "codeblock", etc. */
  type: string;
  /** The raw content of this context item. */
  content: string;
  /** Optional language hint for syntax highlighting. */
  language?: string;
  /** Start line (1-indexed) when `type` is "selection". */
  startLine?: number;
  /** End line (1-indexed) when `type` is "selection". */
  endLine?: number;
}

/** Represents the current state of a tool invocation during agentic mode. */
export interface ToolCallState {
  /** Unique ID for this particular tool call. */
  id: string;
  /** The tool being invoked (e.g. "run_command", "edit_file"). */
  toolName: string;
  /** Arguments passed to the tool (JSON-stringified by the server). */
  args: string;
  /** Current lifecycle state. */
  status: "pending" | "running" | "completed" | "error";
  /** Tool output / result once finished. */
  output?: string;
  /** Human-readable error description, if status is "error". */
  error?: string;
}

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

/** A single message within a chat conversation. */
export interface ChatMessage {
  /** Unique message ID. */
  id: string;
  /** Role of the message author. */
  role: "user" | "assistant" | "system" | "tool";
  /** Text content — may contain Markdown. */
  content: string;
  /** Attached context items (files, selections, etc.). */
  context?: ContextItem[];
  /** Active tool calls associated with this message. */
  toolCalls?: ToolCallState[];
  /** ISO-8601 timestamp of when this message was created. */
  createdAt: string;
}

/** Legacy alias kept for backward-compat with older session shapes. */
export type ChatHistoryItem = ChatMessage;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Lightweight metadata returned by list endpoints. */
export interface SessionMetadata {
  /** Session ID. */
  id: string;
  /** User-defined or auto-generated session title. */
  title: string;
  /** ISO-8601 creation timestamp (may not always be present). */
  createdAt?: string;
  /** ISO-8601 last-activity timestamp. */
  lastModified?: string;
  /** Number of messages in this session. */
  messageCount?: number;
  /** The chat mode used in this session. */
  mode?: ChatMode;
}

/** Full session payload including message history. */
export interface Session extends SessionMetadata {
  /** Ordered list of messages in this session. */
  messages: ChatMessage[];
}

// ---------------------------------------------------------------------------
// Models & configuration
// ---------------------------------------------------------------------------

/** Describes an available LLM model. */
export interface ModelInfo {
  /** Machine-readable model identifier. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Provider name (e.g. "openai", "anthropic", "ollama"). */
  provider: string;
  /** Maximum context window size in tokens. */
  contextLength?: number;
  /** Whether streaming is supported. */
  supportsStreaming?: boolean;
  /** Optional description or notes about the model. */
  description?: string;
}

/** Server health check response. */
export interface HealthResponse {
  /** Current server status. */
  status: "ok" | "degraded" | "error";
  /** SemVer version of the running server. */
  version: string;
  /** Server uptime in seconds. */
  uptime: number;
  /** ISO-8601 timestamp of the health check. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Chat tabs (client-side only)
// ---------------------------------------------------------------------------

/** Represents one open tab in the multi-tab chat UI. */
export interface ChatTab {
  /** Unique tab ID. */
  id: string;
  /** Backing session ID — `null` for unsaved / new chats. */
  sessionId: string | null;
  /** Display title for the tab. */
  title: string;
  /** Ordered messages in this tab. */
  messages: ChatMessage[];
  /** Current chat mode. */
  mode: ChatMode;
  /** `true` while the assistant is actively streaming a response. */
  isStreaming: boolean;
  /** AbortController used to cancel an in-flight stream. */
  abortController: AbortController | null;
  /** ISO-8601 timestamp when this tab was created. */
  createdAt: string;
  /**
   * YOLO mode — when enabled, tool calls with auto-apply are sent
   * without user confirmation prompts.
   */
  yoloMode: boolean;
}
