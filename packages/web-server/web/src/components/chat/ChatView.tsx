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

const ChatView = () => {
  const messages = useChatStore((s) => s.getActiveTab()?.messages ?? []);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
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
      {messages.map((msg: ChatMessage) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default ChatView;
