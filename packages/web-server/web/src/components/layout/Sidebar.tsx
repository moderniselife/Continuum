/**
 * Sidebar — Left-hand navigation panel (260px wide, collapsible).
 *
 * Contains a "New Chat" button, a search input, and the session list.
 */

import { Plus, Search } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import { useConfigStore } from "@/stores/configStore";
import SessionList from "@/components/sessions/SessionList";

function Sidebar() {
  const { createSession, searchQuery, setSearchQuery } = useSessionStore();
  const sidebarOpen = useConfigStore((s) => s.sidebarOpen);

  return (
    <aside
      className={`bg-bg-surface border-border flex flex-col gap-2 border-r p-3 transition-all duration-200 ${
        sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden p-0"
      }`}
    >
      {/* New Chat button */}
      <button
        type="button"
        onClick={createSession}
        className="bg-accent hover:bg-accent-hover flex w-full items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium text-white transition-all duration-150"
      >
        <Plus size={16} />
        New Chat
      </button>

      {/* Search input */}
      <div className="relative">
        <Search
          size={14}
          className="text-text-tertiary pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="bg-bg-base border-border text-text-primary placeholder:text-text-tertiary focus:border-border-hover w-full rounded-md border py-1.5 pl-8 pr-3 text-sm transition-all duration-150 focus:outline-none"
        />
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        <SessionList />
      </div>
    </aside>
  );
}

export default Sidebar;
