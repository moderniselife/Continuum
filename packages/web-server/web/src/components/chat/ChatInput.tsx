/**
 * ChatInput — Message input area with auto-growing textarea.
 * Handles Enter-to-send, Shift+Enter for newlines, and displays
 * either a Send or Abort button based on streaming state.
 * Includes the ModeSelector below the textarea.
 */

import {
  useState,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { Send, Square } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import ModeSelector from "./ModeSelector";

const MAX_ROWS = 8;
const LINE_HEIGHT = 24; // Approximate line height in pixels

const ChatInput = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortStreaming = useChatStore((s) => s.abortStreaming);

  // Select primitive to avoid infinite re-render
  const tabs = useChatStore((s) => s.tabs);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isStreaming = activeTab?.isStreaming ?? false;

  /** Auto-resize the textarea based on content, capped at MAX_ROWS. */
  const handleResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height so scrollHeight recalculates
    textarea.style.height = "auto";
    const maxHeight = LINE_HEIGHT * MAX_ROWS;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      handleResize();
    },
    [handleResize],
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;

    sendMessage(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const isEmpty = !value.trim();

  return (
    <div className="bg-bg-surface border-border rounded-2xl border p-3">
      {/* Input row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder="Send a message…"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="bg-bg-elevated border-border focus:border-accent/50 text-text-primary placeholder:text-text-tertiary w-full resize-none rounded-xl border px-4 py-3 font-sans transition-all duration-150 focus:outline-none"
        />

        {isStreaming ? (
          <button
            onClick={() => abortStreaming()}
            className="bg-error/20 hover:bg-error/30 text-error shrink-0 rounded-lg p-2 transition-all duration-150"
            aria-label="Abort generation"
          >
            <Square size={18} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={isEmpty}
            className={`bg-accent hover:bg-accent-hover shrink-0 rounded-lg p-2 text-white transition-all duration-150 ${isEmpty ? "cursor-not-allowed opacity-50" : ""} `}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        )}
      </div>

      {/* Mode selector row */}
      <div className="mt-2">
        <ModeSelector />
      </div>
    </div>
  );
};

export default ChatInput;
