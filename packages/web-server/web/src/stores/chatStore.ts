/**
 * Continuum Web IDE — Chat Store
 *
 * Multi-tab chat state management with streaming support, YOLO mode, and
 * tight integration with the WebSocket layer. Each tab is an independent
 * conversation that may or may not be backed by a persisted session.
 *
 * @module stores/chatStore
 */

import { create } from "zustand";
import type {
  ChatMessage,
  ChatMode,
  ChatTab,
  ContextItem,
  ToolCallState,
} from "@/api/types";
import { ws } from "@/api/ws";
import { useSessionStore } from "./sessionStore";
import { useConfigStore } from "./configStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default mode for new tabs. */
const DEFAULT_MODE: ChatMode = "chat";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface ChatState {
  /** All open chat tabs. */
  tabs: ChatTab[];
  /** ID of the currently visible tab. */
  activeTabId: string | null;

  // -- Tab lifecycle --------------------------------------------------------
  /** Create a new, empty chat tab and make it active. */
  newChat: (mode?: ChatMode) => string;
  /** Open an existing session in a new (or existing) tab. */
  openSession: (sessionId: string) => Promise<void>;
  /** Close a tab by ID. */
  closeTab: (tabId: string) => void;
  /** Switch the active tab. */
  setActiveTab: (tabId: string) => void;

  // -- Messaging ------------------------------------------------------------
  /**
   * Send a user message in the active tab and stream the assistant's reply.
   *
   * @param content  The user's message text.
   * @param context  Optional context items to attach.
   */
  sendMessage: (content: string, context?: ContextItem[]) => Promise<void>;
  /** Abort an in-flight streaming response for a tab. */
  abortStreaming: (tabId?: string) => void;

  // -- Mode & settings ------------------------------------------------------
  /** Change the chat mode for a given tab. */
  setMode: (tabId: string, mode: ChatMode) => void;
  /** Toggle YOLO mode on a tab. */
  toggleYoloMode: (tabId: string) => void;

  // -- Internal helpers (exposed for testability) ---------------------------
  /** Get the currently active tab (or `null`). */
  getActiveTab: () => ChatTab | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Create a fresh ChatTab with sensible defaults. */
function createTab(
  mode: ChatMode = DEFAULT_MODE,
  sessionId: string | null = null,
  title = "New Chat",
): ChatTab {
  return {
    id: crypto.randomUUID(),
    sessionId,
    title,
    messages: [],
    mode,
    isStreaming: false,
    abortController: null,
    createdAt: new Date().toISOString(),
    yoloMode: false,
  };
}

/** Immutably update a single tab within the tabs array. */
function updateTab(
  tabs: ChatTab[],
  tabId: string,
  updater: (tab: ChatTab) => Partial<ChatTab>,
): ChatTab[] {
  return tabs.map((tab) =>
    tab.id === tabId ? { ...tab, ...updater(tab) } : tab,
  );
}

/** Append a message to a tab's message list. */
function appendMessage(tab: ChatTab, message: ChatMessage): Partial<ChatTab> {
  return { messages: [...tab.messages, message] };
}

/** Replace the last message in a tab (used during streaming). */
function replaceLastMessage(
  tab: ChatTab,
  updater: (msg: ChatMessage) => ChatMessage,
): Partial<ChatTab> {
  if (tab.messages.length === 0) return {};
  const msgs = [...tab.messages];
  msgs[msgs.length - 1] = updater(msgs[msgs.length - 1]);
  return { messages: msgs };
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useChatStore = create<ChatState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  // -----------------------------------------------------------------------
  // Tab lifecycle
  // -----------------------------------------------------------------------

  newChat: (mode = DEFAULT_MODE) => {
    const tab = createTab(mode);
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },

  openSession: async (sessionId: string) => {
    const { tabs } = get();

    // If a tab for this session already exists, just switch to it.
    const existing = tabs.find((t) => t.sessionId === sessionId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    // Fetch the full session from the session store.
    const sessionStore = useSessionStore.getState();
    const session = await sessionStore.fetchSession(sessionId);

    const tab = createTab(session.mode, session.id, session.title);
    tab.messages = session.messages;

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
  },

  closeTab: (tabId: string) => {
    set((state) => {
      const nextTabs = state.tabs.filter((t) => t.id !== tabId);

      // If we closed the active tab, switch to the nearest neighbour.
      let nextActive = state.activeTabId;
      if (state.activeTabId === tabId) {
        const closedIndex = state.tabs.findIndex((t) => t.id === tabId);
        nextActive =
          nextTabs[Math.min(closedIndex, nextTabs.length - 1)]?.id ?? null;
      }

      return { tabs: nextTabs, activeTabId: nextActive };
    });
  },

  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  sendMessage: async (content: string, context?: ContextItem[]) => {
    const activeTab = get().getActiveTab();
    if (!activeTab) {
      console.warn("[chatStore] No active tab — cannot send message.");
      return;
    }

    const tabId = activeTab.id;

    // Build the user message.
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      context,
      createdAt: new Date().toISOString(),
    };

    // Build a placeholder assistant message that we'll populate via streaming.
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      toolCalls: [],
      createdAt: new Date().toISOString(),
    };

    // Create an AbortController so the user can cancel.
    const abortController = new AbortController();

    // Update the tab: add both messages and mark streaming.
    set((state) => ({
      tabs: updateTab(state.tabs, tabId, (tab) => ({
        messages: [...tab.messages, userMessage, assistantMessage],
        isStreaming: true,
        abortController,
      })),
    }));

    // Determine the effective mode — YOLO mode adds the allowAutoApply flag.
    const tab = get().tabs.find((t) => t.id === tabId)!;
    const effectiveMode = tab.yoloMode ? "mode-yolo" : tab.mode;

    // Gather selected model from config store.
    const selectedModelId = useConfigStore.getState().selectedModelId;

    // Build the WS request payload.
    const payload = {
      sessionId: tab.sessionId,
      mode: effectiveMode,
      modelId: selectedModelId,
      message: {
        content,
        context,
      },
      ...(tab.yoloMode && { allowAutoApply: true }),
    };

    try {
      await ws.stream("chat/send", payload, (chunk) => {
        // If the user aborted, bail out.
        if (abortController.signal.aborted) return;

        const data = chunk as {
          content?: string;
          toolCalls?: ToolCallState[];
          sessionId?: string;
          title?: string;
          done?: boolean;
        };

        set((state) => ({
          tabs: updateTab(state.tabs, tabId, (t) => {
            const updates: Partial<ChatTab> = {};

            // Append streamed content.
            if (data.content !== undefined) {
              const lastMsg = t.messages[t.messages.length - 1];
              const updatedMsg: ChatMessage = {
                ...lastMsg,
                content: lastMsg.content + data.content,
              };
              updates.messages = [...t.messages.slice(0, -1), updatedMsg];
            }

            // Update tool call state.
            if (data.toolCalls) {
              const lastMsg = (updates.messages ?? t.messages)[
                (updates.messages ?? t.messages).length - 1
              ];
              const updatedMsg: ChatMessage = {
                ...lastMsg,
                toolCalls: data.toolCalls,
              };
              updates.messages = [
                ...(updates.messages ?? t.messages).slice(0, -1),
                updatedMsg,
              ];
            }

            // Server assigned a session ID — persist it on the tab.
            if (data.sessionId && !t.sessionId) {
              updates.sessionId = data.sessionId;
            }

            // Server suggested a title — update the tab title.
            if (data.title) {
              updates.title = data.title;
            }

            return updates;
          }),
        }));

        // If we received a sessionId, upsert into the session sidebar.
        if (data.sessionId) {
          useSessionStore.getState().upsertSessionMeta({
            id: data.sessionId,
            title: data.title ?? tab.title,
            createdAt: tab.createdAt,
            updatedAt: new Date().toISOString(),
            messageCount:
              get().tabs.find((t) => t.id === tabId)?.messages.length ?? 0,
            mode: tab.mode,
          });
        }
      });
    } catch (err) {
      if (abortController.signal.aborted) {
        // Expected — user cancelled; nothing to report.
      } else {
        console.error("[chatStore] sendMessage stream error:", err);

        // Append an error notice to the assistant message.
        const errorText =
          err instanceof Error ? err.message : "An unknown error occurred";
        set((state) => ({
          tabs: updateTab(state.tabs, tabId, (t) =>
            replaceLastMessage(t, (msg) => ({
              ...msg,
              content: msg.content + `\n\n> ⚠️ **Error:** ${errorText}`,
            })),
          ),
        }));
      }
    } finally {
      // Always clear the streaming state.
      set((state) => ({
        tabs: updateTab(state.tabs, tabId, () => ({
          isStreaming: false,
          abortController: null,
        })),
      }));
    }
  },

  abortStreaming: (tabId?: string) => {
    const targetId = tabId ?? get().activeTabId;
    if (!targetId) return;

    const tab = get().tabs.find((t) => t.id === targetId);
    if (tab?.abortController) {
      tab.abortController.abort();
    }

    set((state) => ({
      tabs: updateTab(state.tabs, targetId, () => ({
        isStreaming: false,
        abortController: null,
      })),
    }));
  },

  // -----------------------------------------------------------------------
  // Mode & settings
  // -----------------------------------------------------------------------

  setMode: (tabId: string, mode: ChatMode) => {
    set((state) => ({
      tabs: updateTab(state.tabs, tabId, () => ({ mode })),
    }));
  },

  toggleYoloMode: (tabId: string) => {
    set((state) => ({
      tabs: updateTab(state.tabs, tabId, (tab) => ({
        yoloMode: !tab.yoloMode,
      })),
    }));
  },

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    if (!activeTabId) return null;
    return tabs.find((t) => t.id === activeTabId) ?? null;
  },
}));
