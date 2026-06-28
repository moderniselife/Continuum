/**
 * ChatView — Scrollable message list with auto-scroll and empty state.
 * Renders all messages from the chat store as MessageBubble components
 * and automatically scrolls to the bottom when new messages arrive.
 */

import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import type { ChatMessage } from "@/api/types";
import MessageBubble from "./MessageBubble";
import StreamingDots from "./StreamingDots";

const ChatView = () => {
  // Select primitives / arrays from the store — avoid getActiveTab() in selector
  const tabs = useChatStore((s) => s.tabs);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const messages = activeTab?.messages ?? [];
  const isStreaming = activeTab?.isStreaming ?? false;

  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="text-text-tertiary flex flex-1 flex-col items-center justify-center overflow-y-auto p-4">
        <MessageSquare size={48} className="mb-4 opacity-40" />
        <h3 className="text-text-secondary mb-1 text-lg font-semibold">
          Start a conversation
        </h3>
        <p className="text-sm">Type a message below to begin</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((msg: ChatMessage, index: number) => {
        // The last assistant message during streaming is the one being generated
        const isLastAssistantStreaming =
          isStreaming &&
          msg.role === "assistant" &&
          index === messages.length - 1;

        return (
          <MessageBubble
            key={msg.id ?? `msg-${index}`}
            message={msg}
            isStreaming={isLastAssistantStreaming}
          />
        );
      })}
      {/* Show dots only when streaming but last assistant message has no content yet */}
      {isStreaming &&
        messages.length > 0 &&
        messages[messages.length - 1]?.content === "" && (
          <div className="bg-bg-surface animate-fade-in rounded-2xl p-4">
            <StreamingDots />
          </div>
        )}
      <div ref={bottomRef} />
    </div>
  );
};

export default ChatView;
