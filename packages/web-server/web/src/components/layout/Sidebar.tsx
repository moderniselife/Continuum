/**
 * Sidebar — Left-hand navigation panel (280px wide, collapsible).
 *
 * Liquid Glass design: frosted glass-heavy panel with gradient-accent
 * New Chat button, glass search input, and scrollable session list.
 */

import { Plus, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";
import SessionList from "@/components/sessions/SessionList";

function Sidebar() {
  const { searchQuery, setSearchQuery } = useSessionStore();
  const newChat = useChatStore((s) => s.newChat);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={`glass-heavy border-border-glass relative flex flex-col border-r transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${
        sidebarOpen
          ? "w-[280px] p-3 opacity-100"
          : "w-0 overflow-hidden p-0 opacity-0"
      }`}
    >
      {/* New Chat button — gradient accent with glow */}
      <button
        type="button"
        onClick={() => newChat()}
        className="gradient-accent glow-accent group mb-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
      >
        <Plus
          size={16}
          className="transition-transform duration-200 group-hover:rotate-90"
        />
        New Chat
      </button>

      {/* Search input — glass-input style */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="text-text-tertiary pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations…"
          className="glass-input w-full rounded-lg py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {/* Session list — scrollable */}
      <div className="scrollbar-hide flex-1 overflow-y-auto">
        <SessionList />
      </div>

      {/* Toggle button */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="text-text-tertiary hover:text-text-primary hover:bg-bg-hover mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs transition-all duration-200"
        aria-label="Collapse sidebar"
      >
        <PanelLeftClose size={14} />
        <span>Collapse</span>
      </button>
    </aside>
  );
}

/**
 * Floating button rendered outside the sidebar when it's closed,
 * allowing the user to re-open it.
 */
export function SidebarToggle() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  if (sidebarOpen) return null;

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="glass text-text-secondary hover:text-text-primary fixed left-3 top-[52px] z-20 rounded-lg p-1.5 transition-all duration-200 hover:shadow-[0_0_10px_rgba(124,106,255,0.2)]"
      aria-label="Expand sidebar"
    >
      <PanelLeftOpen size={16} />
    </button>
  );
}

export default Sidebar;
