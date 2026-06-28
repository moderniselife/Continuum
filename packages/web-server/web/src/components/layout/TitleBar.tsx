/**
 * TitleBar — Top bar of the Continuum Web IDE (44px height).
 *
 * Liquid Glass design: frosted glass-heavy panel with luminous accent
 * logo, centred session tabs, connection indicator, and settings gear.
 */

import { Settings, Zap } from "lucide-react";
import SessionTabs from "@/components/sessions/SessionTabs";
import { useUIStore } from "@/stores/uiStore";
import { useConnectionStore } from "@/stores/connectionStore";

function TitleBar() {
  const openSettings = useUIStore((s) => s.openSettings);
  const status = useConnectionStore((s) => s.status);
  const isConnected = status === "connected";

  return (
    <header className="glass-heavy glass-shine border-border-glass flex h-[44px] shrink-0 items-center justify-between border-b px-4">
      {/* Logo — glowing accent */}
      <div className="flex items-center gap-2">
        <span className="glow-accent-strong flex select-none items-center gap-1.5 text-sm font-bold">
          <Zap
            size={16}
            className="text-accent drop-shadow-[0_0_8px_var(--color-accent-glow)]"
          />
          <span className="from-accent to-accent-hover bg-gradient-to-r bg-clip-text text-transparent">
            Continuum
          </span>
        </span>
      </div>

      {/* Session tabs — centred */}
      <div className="mx-4 flex flex-1 justify-center overflow-hidden">
        <SessionTabs />
      </div>

      {/* Right-side controls */}
      <div className="flex items-center gap-3">
        {/* Connection indicator */}
        <div className="flex items-center gap-1.5" title={status}>
          <span
            className={`h-2 w-2 rounded-full transition-colors duration-300 ${
              isConnected
                ? "bg-mode-agent animate-pulse shadow-[0_0_6px_theme(colors.mode.agent)]"
                : "bg-red-500 shadow-[0_0_6px_theme(colors.red.500)]"
            }`}
          />
          <span className="text-text-tertiary text-[10px] uppercase tracking-wider">
            {isConnected ? "Live" : "Offline"}
          </span>
        </div>

        {/* Settings gear */}
        <button
          type="button"
          aria-label="Settings"
          onClick={() => openSettings()}
          className="text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg p-1.5 transition-all duration-200 hover:shadow-[0_0_10px_rgba(124,106,255,0.15)]"
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}

export default TitleBar;
