/**
 * ActivityBar — Vertical icon bar for the Continuum Web IDE.
 *
 * 48px wide, full height, Liquid Glass background. Houses the primary
 * navigation icons:
 *   - Explorer (file tree)
 *   - Search
 *   - Git
 *   - Chat
 *   - Terminal toggle (bottom-pinned)
 *
 * Active panel gets a left accent border and accent text colour.
 */

import {
  FolderTree,
  GitBranch,
  MessageSquare,
  Search,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { useUIStore, type ActivityPanel } from "@/stores/uiStore";

// ---------------------------------------------------------------------------
// Button definition
// ---------------------------------------------------------------------------

interface ActivityButton {
  id: ActivityPanel;
  icon: typeof FolderTree;
  label: string;
}

const ACTIVITIES: ActivityButton[] = [
  { id: "explorer", icon: FolderTree, label: "Explorer" },
  { id: "search", icon: Search, label: "Search" },
  { id: "git", icon: GitBranch, label: "Source Control" },
  { id: "rules", icon: ShieldCheck, label: "Rules" },
  { id: "skills", icon: Zap, label: "Skills" },
  { id: "chat", icon: MessageSquare, label: "Chat" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ActivityBar() {
  const activeActivity = useUIStore((s) => s.activeActivity);
  const setActiveActivity = useUIStore((s) => s.setActiveActivity);
  const terminalOpen = useUIStore((s) => s.terminalOpen);
  const toggleTerminal = useUIStore((s) => s.toggleTerminal);

  return (
    <nav
      className="glass-heavy border-border-glass flex w-12 shrink-0 flex-col items-center border-r py-2"
      aria-label="Activity bar"
    >
      {/* Primary activity icons */}
      <div className="flex flex-col items-center gap-0.5">
        {ACTIVITIES.map(({ id, icon: Icon, label }) => {
          const isActive = activeActivity === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveActivity(id)}
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-150 ${
                isActive
                  ? "text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
              title={label}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Left accent indicator */}
              {isActive && (
                <span className="bg-accent absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r" />
              )}
              <Icon size={20} />
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Terminal toggle (bottom) */}
      <button
        type="button"
        onClick={toggleTerminal}
        className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-150 ${
          terminalOpen
            ? "text-accent"
            : "text-text-tertiary hover:text-text-secondary"
        }`}
        title={terminalOpen ? "Hide terminal" : "Show terminal"}
        aria-label="Toggle terminal"
      >
        <Terminal size={20} />
      </button>
    </nav>
  );
}

export default ActivityBar;
