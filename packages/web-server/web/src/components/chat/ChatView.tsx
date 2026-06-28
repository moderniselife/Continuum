/**
 * ChatView — Scrollable message list with auto-scroll.
 *
 * Renders all messages from the active chat tab as MessageBubble
 * components and automatically scrolls to the bottom when new messages
 * arrive. Shows StreamingDots in a glass-subtle pill when streaming
 * and the last assistant message has no content yet. When empty, renders
 * nothing — the welcome screen is handled by ChatPanel.
 *
 * @remarks Uses the Liquid Glass design language.
 */

import { useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import type { ChatMessage } from "@/api/types";
import MessageBubble from "./MessageBubble";
import StreamingDots from "./StreamingDots";

const ChatView = () => {
  // Select primitives / arrays from the store
  const tabs = useChatStore((s) => s.tabs);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const messages = activeTab?.messages ?? [];
  const isStreaming = activeTab?.isStreaming ?? false;

  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or streaming state shifts
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  // Empty state — ChatPanel handles the welcome screen
  if (messages.length === 0 && !isStreaming) {
    return <div className="flex-1" />;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-4">
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

      {/* Show streaming dots when streaming but the last assistant message has no content yet */}
      {isStreaming &&
        messages.length > 0 &&
        messages[messages.length - 1]?.content === "" && (
          <div className="animate-fade-in self-start pl-10">
            <StreamingDots />
          </div>
        )}

      <div ref={bottomRef} />
    </div>
  );
};

export default ChatView;
