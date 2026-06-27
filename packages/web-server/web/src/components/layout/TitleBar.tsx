/**
 * TitleBar — Top bar of the Continuum Web IDE (40px height).
 *
 * Displays the logo, session tabs, and a settings button.
 */

import { Settings } from "lucide-react";
import SessionTabs from "@/components/sessions/SessionTabs";

function TitleBar() {
  return (
    <header className="bg-bg-surface border-border flex h-[40px] items-center justify-between border-b px-4">
      {/* Logo */}
      <span className="text-accent select-none whitespace-nowrap font-bold drop-shadow-[0_0_6px_var(--color-accent)]">
        ⚡ Continuum
      </span>

      {/* Session tabs — centred */}
      <div className="mx-4 flex flex-1 justify-center overflow-hidden">
        <SessionTabs />
      </div>

      {/* Settings */}
      <button
        type="button"
        aria-label="Settings"
        className="text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-md p-1.5 transition-all duration-150"
      >
        <Settings size={16} />
      </button>
    </header>
  );
}

export default TitleBar;
