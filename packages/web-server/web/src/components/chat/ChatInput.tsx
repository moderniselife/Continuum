/**
 * ChatInput — Message input area with auto-growing textarea, @file
 * context mentions, and context chips.
 *
 * Outer container uses glass-heavy with rounded-2xl. The textarea uses
 * glass-input styling that auto-grows up to 8 rows. When the user types
 * `@`, the AtMentionDropdown appears above the input for context provider
 * selection. Selected files appear as removable chips above the textarea.
 *
 * Below the textarea, the ModeSelector sits on the left and the Send/Abort
 * button on the right. Send uses gradient-accent with glow; Abort uses a
 * red-tinted glass style. A Cmd+Enter hint is shown next to the send button.
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
import { Send, Square, X, FileText } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import type { ContextItem } from "@/api/types";
import { readFileContent } from "@/api/context";
import ModeSelector from "./ModeSelector";
import AtMentionDropdown from "./AtMentionDropdown";

const MAX_ROWS = 8;
const LINE_HEIGHT = 24;

const ChatInput = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);

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

  /**
   * Detect `@` mentions in the textarea and manage dropdown state.
   * An `@` triggers the dropdown when:
   * - It's at position 0, or
   * - The character before it is a space/newline.
   */
  const updateMentionState = useCallback((text: string, cursorPos: number) => {
    // Walk backwards from cursor to find an unmatched `@`
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === "@") {
        // Valid @ trigger: at start of text or preceded by whitespace
        if (i === 0 || /\s/.test(text[i - 1])) {
          atIndex = i;
        }
        break;
      }
      // Stop if we hit a space and haven't found a provider name yet
      // (but allow spaces within provider sub-queries like "@file mySearch")
      if (text[i] === "\n") break;
    }

    if (atIndex >= 0) {
      const query = text.slice(atIndex + 1, cursorPos);
      setShowMentionDropdown(true);
      setMentionQuery(query);
      setMentionStartIndex(atIndex);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery("");
      setMentionStartIndex(-1);
    }
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      handleResize();

      // Update mention state based on cursor position
      const cursorPos = e.target.selectionStart ?? newValue.length;
      updateMentionState(newValue, cursorPos);
    },
    [handleResize, updateMentionState],
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;

    sendMessage(trimmed, contextItems.length > 0 ? contextItems : undefined);
    setValue("");
    setContextItems([]);
    setShowMentionDropdown(false);
    setMentionQuery("");
    setMentionStartIndex(-1);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isStreaming, sendMessage, contextItems]);

  /** Handle file selection from the mention dropdown. */
  const handleMentionSelect = useCallback(
    async (item: { id: string; title: string; description: string }) => {
      // Remove the @mention text from the textarea
      const beforeAt = value.slice(0, mentionStartIndex);
      const afterCursor =
        textareaRef.current?.selectionStart !== undefined
          ? value.slice(textareaRef.current.selectionStart)
          : "";
      const newValue = beforeAt + afterCursor;
      setValue(newValue);

      // Close dropdown
      setShowMentionDropdown(false);
      setMentionQuery("");
      setMentionStartIndex(-1);

      // Fetch file content and add as context item
      try {
        const content = await readFileContent(item.id);
        const newItem: ContextItem = {
          id: item.id,
          name: item.title,
          type: "file",
          content,
        };

        // Avoid duplicates
        setContextItems((prev) => {
          if (prev.some((existing) => existing.id === newItem.id)) return prev;
          return [...prev, newItem];
        });
      } catch (err) {
        console.error("[ChatInput] Failed to read file:", err);
      }

      // Refocus textarea
      textareaRef.current?.focus();
    },
    [value, mentionStartIndex],
  );

  /** Remove a context item chip. */
  const removeContextItem = useCallback((id: string) => {
    setContextItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // If mention dropdown is open, let it handle navigation keys
      if (showMentionDropdown) {
        if (["ArrowUp", "ArrowDown", "Escape"].includes(e.key)) {
          // Handled by dropdown
          return;
        }
        if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
          // Let dropdown handle Enter for selection
          // Only if there's an active mention query
          if (mentionQuery.length > 0) {
            return;
          }
        }
        if (e.key === "Tab") {
          // Tab selects in dropdown
          return;
        }
      }

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
    [handleSend, showMentionDropdown, mentionQuery],
  );

  /** Close the mention dropdown. */
  const handleMentionClose = useCallback(() => {
    setShowMentionDropdown(false);
    setMentionQuery("");
    setMentionStartIndex(-1);
  }, []);

  const isEmpty = !value.trim() && contextItems.length === 0;

  return (
    <div className="glass-heavy border-border-glass relative rounded-2xl border p-3">
      {/* Context item chips */}
      {contextItems.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {contextItems.map((item) => (
            <div
              key={item.id}
              className="glass-subtle border-border-glass text-text-secondary group flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors duration-150 hover:border-red-500/30"
            >
              <FileText size={12} className="text-accent shrink-0" />
              <span className="max-w-[150px] truncate font-medium">
                {item.name}
              </span>
              <button
                onClick={() => removeContextItem(item.id)}
                className="text-text-tertiary -mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors duration-100 hover:bg-red-500/20 hover:text-red-400"
                aria-label={`Remove ${item.name}`}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* @ Mention Dropdown */}
      <AtMentionDropdown
        isOpen={showMentionDropdown}
        query={mentionQuery}
        onSelect={handleMentionSelect}
        onClose={handleMentionClose}
      />

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        placeholder="Send a message… (type @ for context)"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="glass-input text-text-primary placeholder:text-text-tertiary w-full resize-none rounded-xl px-4 py-3 text-sm transition-all duration-200 focus:outline-none"
      />

      {/* Bottom bar: ModeSelector left, hint + send/abort right */}
      <div className="mt-2 flex items-center justify-between">
        <ModeSelector />

        <div className="flex items-center gap-2">
          {/* Context hint */}
          {contextItems.length > 0 && (
            <span className="text-accent text-[10px] font-medium">
              {contextItems.length} file{contextItems.length !== 1 ? "s" : ""}{" "}
              attached
            </span>
          )}

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
