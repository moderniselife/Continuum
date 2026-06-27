/**
 * StatusBar — Bottom bar of the Continuum Web IDE (28px height).
 *
 * Shows connection status, active model name, and the current mode badge.
 */

import { useConnectionStore } from "@/stores/connectionStore";
import { useChatStore } from "@/stores/chatStore";

/** Map mode values to their corresponding theme colour classes. */
const MODE_COLOUR: Record<string, string> = {
  chat: "bg-mode-chat",
  agent: "bg-mode-agent",
  plan: "bg-mode-plan",
  yolo: "bg-mode-yolo",
};

function StatusBar() {
  const { connected, status, modelName } = useConnectionStore();
  const mode = useChatStore((s) => s.mode);

  return (
    <footer className="bg-bg-surface border-border text-text-secondary flex h-[28px] select-none items-center justify-between border-t px-4 text-xs">
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            connected ? "bg-success animate-pulse" : "bg-error"
          }`}
        />
        <span>{status}</span>
      </div>

      {/* Model name */}
      <span className="max-w-[40%] truncate text-center">{modelName}</span>

      {/* Mode badge */}
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white ${
          MODE_COLOUR[mode] ?? "bg-mode-chat"
        }`}
      >
        {mode}
      </span>
    </footer>
  );
}

export default StatusBar;
