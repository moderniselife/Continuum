/**
 * MessageBubble — Renders a single chat message bubble.
 * User messages align right with accent styling; assistant messages
 * align left with surface styling and markdown rendering.
 * Empty assistant content displays streaming dots.
 */

import MarkdownRenderer from "@/components/markdown/MarkdownRenderer";
import StreamingDots from "./StreamingDots";
import type { ChatMessage } from "@/api/types";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === "user";

  return (
    <div
      className={`animate-fade-in flex max-w-[85%] flex-col ${isUser ? "self-end" : "self-start"} `}
    >
      <div
        className={`px-4 py-2.5 ${
          isUser
            ? "bg-accent rounded-2xl rounded-br-md text-white"
            : "bg-bg-surface text-text-primary rounded-2xl rounded-bl-md"
        } `}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : (
          <StreamingDots />
        )}
      </div>

      <span
        className={`text-text-tertiary mt-1 text-xs ${isUser ? "text-right" : "text-left"} `}
      >
        {new Date(message.createdAt).toLocaleTimeString("en-AU", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
};

export default MessageBubble;
