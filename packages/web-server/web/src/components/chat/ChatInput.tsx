/**
 * ChatInput — Message input area with auto-growing textarea.
 *
 * Outer container uses glass-heavy with rounded-2xl. The textarea uses
 * glass-input styling that auto-grows up to 8 rows. Below the textarea,
 * the ModeSelector sits on the left and the Send/Abort button on the
 * right. Send uses gradient-accent with glow; Abort uses a red-tinted
 * glass style. A Cmd+Enter hint is shown next to the send button.
 *
 * @remarks Uses the Liquid Glass design language.
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
const LINE_HEIGHT = 24;

const ChatInput = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortStreaming = useChatStore((s) => s.abortStreaming);

  // Select primitives to avoid infinite re-renders
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
      // Cmd+Enter (macOS) or Ctrl+Enter to send
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
        return;
      }
      // Plain Enter also sends (Shift+Enter for newlines)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const isEmpty = !value.trim();

  return (
    <div className="glass-heavy border-border-glass rounded-2xl border p-3">
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        placeholder="Send a message…"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="glass-input text-text-primary placeholder:text-text-tertiary w-full resize-none rounded-xl px-4 py-3 text-sm transition-all duration-200 focus:outline-none"
      />

      {/* Bottom bar: ModeSelector left, hint + send/abort right */}
      <div className="mt-2 flex items-center justify-between">
        <ModeSelector />

        <div className="flex items-center gap-2">
          {/* Keyboard shortcut hint */}
          <span className="text-text-tertiary hidden text-[10px] sm:inline">
            ⌘ Enter
          </span>

          {isStreaming ? (
            <button
              onClick={() => abortStreaming()}
              className="glass flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 text-red-400 transition-all duration-200 hover:border-red-500/50 hover:bg-red-500/10"
              aria-label="Abort generation"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={isEmpty}
              className={`gradient-accent glow-accent flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all duration-200 ${
                isEmpty
                  ? "cursor-not-allowed opacity-40"
                  : "gradient-accent-hover hover:scale-105"
              }`}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
