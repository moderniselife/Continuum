/**
 * ChatPanel — Main chat panel composing the model selector, message view,
 * and input area into a full-height layout.
 *
 * When no messages exist, displays a welcome screen with a gradient logo,
 * a "What would you like to build?" heading, four quick-action glass cards,
 * and keyboard shortcut hints.
 *
 * @remarks Uses the Liquid Glass design language.
 */

import { useEffect, useMemo } from "react";
import {
  Code2,
  Bug,
  BookOpen,
  GitPullRequest,
  Sparkles,
  Command,
  ShieldCheck,
  ShieldX,
  Clock,
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import ModelSelector from "./ModelSelector";
import ChatView from "./ChatView";
import ChatInput from "./ChatInput";

/** Quick-action card metadata. */
const quickActions = [
  {
    icon: Code2,
    label: "Write code",
    description: "Generate code from a prompt",
    prompt: "Write a function that",
  },
  {
    icon: Bug,
    label: "Debug an issue",
    description: "Find and fix bugs quickly",
    prompt: "Help me debug this issue:",
  },
  {
    icon: BookOpen,
    label: "Explain code",
    description: "Understand any codebase",
    prompt: "Explain how this code works:",
  },
  {
    icon: GitPullRequest,
    label: "Review PR",
    description: "Get AI code review feedback",
    prompt: "Review this pull request:",
  },
];

const ChatPanel = () => {
  const tabs = useChatStore((s) => s.tabs);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const newChat = useChatStore((s) => s.newChat);
  const approveToolCall = useChatStore((s) => s.approveToolCall);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const messages = activeTab?.messages ?? [];
  const isStreaming = activeTab?.isStreaming ?? false;
  const hasMessages = messages.length > 0 || isStreaming;

  // Find all pending tool calls across all messages
  const pendingToolCalls = useMemo(() => {
    return messages.flatMap(
      (msg) => msg.toolCalls?.filter((tc) => tc.status === "pending") ?? [],
    );
  }, [messages]);

  // Auto-create a tab on first render so mode buttons work immediately
  useEffect(() => {
    if (tabs.length === 0) {
      newChat();
    }
  }, []);

  const handleApproveAll = () => {
    for (const tc of pendingToolCalls) {
      approveToolCall(tc.id, true);
    }
  };

  const handleRejectAll = () => {
    for (const tc of pendingToolCalls) {
      approveToolCall(tc.id, false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col px-3">
      {/* Glass header bar with model selector */}
      <div className="glass border-border-glass my-2 flex items-center rounded-xl border px-3 py-2">
        <ModelSelector />
      </div>

      {/* Main content area */}
      {hasMessages ? (
        <ChatView />
      ) : (
        /* Welcome screen */
        <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto py-8">
          {/* Gradient logo */}
          <div className="animate-fade-in flex flex-col items-center gap-4">
            <div className="gradient-accent glow-accent-strong flex h-16 w-16 items-center justify-center rounded-2xl">
              <Sparkles size={32} className="text-white" />
            </div>

            <div className="text-center">
              <h1 className="from-accent to-accent bg-gradient-to-r via-emerald-300 bg-clip-text text-2xl font-bold text-transparent">
                What would you like to build?
              </h1>
              <p className="text-text-secondary mt-2 text-sm">
                Start a conversation or pick a quick action below
              </p>
            </div>
          </div>

          {/* Quick-action glass cards */}
          <div className="grid w-full max-w-lg grid-cols-2 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.label}
                  className="glass glass-shine border-border-glass hover:border-border-accent group flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200 hover:scale-[1.02]"
                >
                  <div className="bg-accent/10 text-accent group-hover:bg-accent/20 flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200">
                    <Icon size={16} />
                  </div>
                  <div>
                    <span className="text-text-primary block text-sm font-medium">
                      {action.label}
                    </span>
                    <span className="text-text-tertiary block text-xs">
                      {action.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Keyboard shortcut hints */}
          <div className="text-text-tertiary flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1">
              <kbd className="glass-subtle rounded px-1.5 py-0.5 font-mono text-[10px]">
                <Command size={10} className="inline" />
              </kbd>
              <kbd className="glass-subtle rounded px-1.5 py-0.5 font-mono text-[10px]">
                K
              </kbd>
              <span className="ml-0.5">Command palette</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="glass-subtle rounded px-1.5 py-0.5 font-mono text-[10px]">
                <Command size={10} className="inline" />
              </kbd>
              <kbd className="glass-subtle rounded px-1.5 py-0.5 font-mono text-[10px]">
                ⏎
              </kbd>
              <span className="ml-0.5">Send message</span>
            </span>
          </div>
        </div>
      )}

      {/* Sticky approval bar — visible when tool calls are awaiting approval */}
      {pendingToolCalls.length > 0 && (
        <div className="animate-fade-in glass border-border-accent mx-1 mb-2 flex items-center justify-between rounded-xl border px-4 py-2.5 shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
              <Clock size={16} className="text-amber-400" />
            </div>
            <div>
              <span className="text-text-primary text-sm font-medium">
                {pendingToolCalls.length === 1
                  ? `${pendingToolCalls[0].toolName} awaiting approval`
                  : `${pendingToolCalls.length} tool calls awaiting approval`}
              </span>
              {pendingToolCalls.length > 1 && (
                <span className="text-text-tertiary block text-[10px]">
                  {pendingToolCalls.map((tc) => tc.toolName).join(", ")}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApproveAll}
              className="gradient-accent flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.97]"
            >
              <ShieldCheck size={14} />
              {pendingToolCalls.length === 1 ? "Approve" : "Approve All"}
            </button>
            <button
              type="button"
              onClick={handleRejectAll}
              className="glass-subtle border-border-glass flex items-center gap-1.5 rounded-lg border px-4 py-1.5 text-xs font-medium text-red-400 transition-all duration-150 hover:bg-red-500/10 active:scale-[0.97]"
            >
              <ShieldX size={14} />
              {pendingToolCalls.length === 1 ? "Reject" : "Reject All"}
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="pb-4 pt-2">
        <ChatInput />
      </div>
    </div>
  );
};

export default ChatPanel;
