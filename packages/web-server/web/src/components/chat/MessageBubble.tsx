/**
 * MessageBubble — Renders a single chat message bubble.
 *
 * User messages are right-aligned with gradient-user-bubble styling and
 * glass overlay. Assistant messages are left-aligned with glass-subtle
 * styling and markdown rendering. A thinking state displays an italic
 * dimmed message with a brain icon.
 *
 * Supports:
 * - `<thinking>` blocks rendered as collapsible dimmed sections
 * - Tool call cards rendered after the main content
 * - Automatic stripping of `<tool_call>` XML blocks from content
 *
 * Each bubble includes a role avatar (28px circle), a timestamp visible
 * on hover, and a copy-to-clipboard button on hover.
 *
 * @remarks Uses the Liquid Glass design language.
 */

import { useState, useMemo } from "react";
import { User, Bot, Brain, Copy, Check, ChevronDown } from "lucide-react";
import MarkdownRenderer from "@/components/markdown/MarkdownRenderer";
import StreamingDots from "./StreamingDots";
import ToolCallCard from "./ToolCallCard";
import type { ChatMessage } from "@/api/types";
import { useChatStore } from "@/stores/chatStore";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// Content parsing helpers
// ---------------------------------------------------------------------------

/** Regex to match `<thinking>...</thinking>` blocks (greedy, multiline). */
const THINKING_RE = /<thinking>([\s\S]*?)<\/thinking>/g;

/** Regex to match `<tool_call>...</tool_call>` XML blocks. */
const TOOL_CALL_XML_RE = /<tool_call>[\s\S]*?<\/tool_call>/g;

interface ParsedContent {
  /** Extracted thinking/reasoning blocks. */
  thinkingBlocks: string[];
  /** Main content with thinking and tool_call XML stripped. */
  cleanContent: string;
}

/** Extracts thinking blocks and strips tool_call XML from message content. */
function parseContent(raw: string): ParsedContent {
  const thinkingBlocks: string[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  THINKING_RE.lastIndex = 0;
  while ((match = THINKING_RE.exec(raw)) !== null) {
    const block = match[1].trim();
    if (block) thinkingBlocks.push(block);
  }

  // Strip both thinking and tool_call XML from the content
  const cleanContent = raw
    .replace(THINKING_RE, "")
    .replace(TOOL_CALL_XML_RE, "")
    .trim();

  return { thinkingBlocks, cleanContent };
}

// ---------------------------------------------------------------------------
// Thinking block sub-component
// ---------------------------------------------------------------------------

function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="text-text-tertiary hover:text-text-secondary flex items-center gap-1.5 text-xs transition-colors duration-150"
      >
        <Brain size={12} className="shrink-0" />
        <span className="italic">Thinking…</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`transition-all duration-200 ease-in-out ${
          expanded ? "mt-1.5 max-h-[400px] opacity-100" : "max-h-0 opacity-0"
        } overflow-hidden`}
      >
        <div className="border-border-glass text-text-tertiary rounded-lg border bg-white/[0.02] px-3 py-2 text-xs italic leading-relaxed">
          <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const MessageBubble = ({ message, isStreaming }: MessageBubbleProps) => {
  const isUser = message.role === "user";
  const isThinking = isStreaming && !message.content;
  const [copied, setCopied] = useState(false);

  const approveToolCall = useChatStore((s) => s.approveToolCall);

  // Parse thinking blocks and clean content
  const { thinkingBlocks, cleanContent } = useMemo(
    () => parseContent(message.content || ""),
    [message.content],
  );

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
          ) : cleanContent || thinkingBlocks.length > 0 ? (
            <div className="prose-sm">
              {/* Thinking/reasoning blocks — rendered before main content */}
              {thinkingBlocks.map((block, idx) => (
                <ThinkingBlock key={idx} content={block} />
              ))}

              {/* Main markdown content */}
              {cleanContent && <MarkdownRenderer content={cleanContent} />}
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

        {/* Tool call cards — rendered after the bubble */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-1 space-y-2">
            {message.toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                toolCall={tc}
                onApprove={(id) => approveToolCall(id, true)}
                onReject={(id) => approveToolCall(id, false)}
              />
            ))}
          </div>
        )}

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
