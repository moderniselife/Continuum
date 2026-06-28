/**
 * MessageBubble — Renders a single chat message bubble.
 *
 * User messages are right-aligned with gradient-user-bubble styling and
 * glass overlay. Assistant messages are left-aligned with glass-subtle
 * styling and markdown rendering. A thinking state displays an italic
 * dimmed message with a brain icon.
 *
 * Each bubble includes a role avatar (28px circle), a timestamp visible
 * on hover, and a copy-to-clipboard button on hover.
 *
 * @remarks Uses the Liquid Glass design language.
 */

import { useState } from "react";
import { User, Bot, Brain, Copy, Check } from "lucide-react";
import MarkdownRenderer from "@/components/markdown/MarkdownRenderer";
import StreamingDots from "./StreamingDots";
import type { ChatMessage } from "@/api/types";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

const MessageBubble = ({ message, isStreaming }: MessageBubbleProps) => {
  const isUser = message.role === "user";
  const isThinking = isStreaming && !message.content;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`animate-fade-in group flex items-end gap-2.5 ${
        isUser ? "flex-row-reverse self-end" : "self-start"
      }`}
      style={{ maxWidth: "85%" }}
    >
      {/* Role avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "gradient-accent text-white"
            : "glass border-border-glass text-accent border"
        }`}
      >
        {isThinking ? (
          <Brain size={14} />
        ) : isUser ? (
          <User size={14} />
        ) : (
          <Bot size={14} />
        )}
      </div>

      {/* Bubble content */}
      <div className="flex min-w-0 flex-col gap-1">
        <div
          className={`relative px-4 py-2.5 ${
            isUser
              ? "gradient-user-bubble glass rounded-2xl rounded-br-sm text-white"
              : "glass-subtle text-text-primary rounded-2xl rounded-bl-sm"
          }`}
        >
          {isThinking ? (
            <div className="text-text-tertiary flex items-center gap-2 italic">
              <StreamingDots />
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </p>
          ) : message.content ? (
            <div className="prose-sm">
              <MarkdownRenderer content={message.content} />
            </div>
          ) : (
            <StreamingDots />
          )}

          {/* Copy button — visible on hover */}
          {message.content && (
            <button
              onClick={handleCopy}
              className="glass border-border-glass text-text-tertiary hover:text-text-primary absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border opacity-0 transition-all duration-200 group-hover:opacity-100"
              aria-label="Copy message"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
          )}
        </div>

        {/* Timestamp — visible on hover */}
        <span
          className={`text-text-tertiary text-[10px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {new Date(message.createdAt).toLocaleTimeString("en-AU", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
};

export default MessageBubble;
