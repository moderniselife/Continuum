/**
 * SessionTabs — Horizontal session tab bar for the TitleBar.
 *
 * Liquid Glass design: frosted glass pill tabs with active accent border,
 * close button on hover, and a glowing new-tab button.
 */

import { useCallback } from "react";
import { X, Plus } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";

/** Maximum number of tabs visible in the tab bar. */
const MAX_VISIBLE_TABS = 5;

/**
 * Horizontal session tab bar for the title bar.
 * Displays up to MAX_VISIBLE_TABS chat tabs as closeable glass pills
 * with a trailing "new session" button.
 */
const SessionTabs = () => {
  const tabs = useChatStore((s) => s.tabs);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const newChat = useChatStore((s) => s.newChat);
  const closeTab = useChatStore((s) => s.closeTab);

  const visibleTabs = tabs.slice(0, MAX_VISIBLE_TABS);

  const handleTabClick = useCallback(
    (id: string) => {
      setActiveTab(id);
    },
    [setActiveTab],
  );

  const handleClose = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      closeTab(id);
    },
    [closeTab],
  );

  const handleCreate = useCallback(() => {
    newChat();
  }, [newChat]);

  return (
    <div className="scrollbar-hide flex flex-row items-center gap-1 overflow-x-auto">
      {visibleTabs.map((tab) => {
        const isActive = activeTabId === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={`group flex max-w-[160px] shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-xs transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${
              isActive
                ? "glass text-text-primary border-border-accent border shadow-[0_0_12px_rgba(124,106,255,0.15)]"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            }`}
          >
            {/* Active indicator dot */}
            {isActive && (
              <span className="bg-accent h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_6px_var(--color-accent-glow)]" />
            )}

            <span className="truncate">{tab.title}</span>

            {/* Close tab button — visible on hover */}
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => handleClose(e, tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  closeTab(tab.id);
                }
              }}
              className="hover:bg-bg-hover -mr-1 rounded-md p-0.5 opacity-0 transition-all duration-150 group-hover:opacity-100"
              aria-label={`Close tab: ${tab.title}`}
            >
              <X size={12} />
            </span>
          </button>
        );
      })}

      {/* New session button */}
      <button
        type="button"
        onClick={handleCreate}
        className="text-text-tertiary hover:text-accent hover:bg-bg-hover shrink-0 rounded-lg p-1.5 transition-all duration-200 hover:shadow-[0_0_8px_rgba(124,106,255,0.15)]"
        aria-label="Create new session"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};

export default SessionTabs;
