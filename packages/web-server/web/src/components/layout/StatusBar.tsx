/**
 * StatusBar — Bottom bar of the Continuum Web IDE (28px height).
 *
 * Liquid Glass design: translucent frosted glass footer with connection
 * status indicator, active model name, and mode badge pill.
 */

import { useConnectionStore } from "@/stores/connectionStore";
import { useChatStore } from "@/stores/chatStore";
import { useConfigStore } from "@/stores/configStore";

/** Map mode values to their corresponding theme colour classes. */
const MODE_COLOUR: Record<string, string> = {
  chat: "bg-mode-chat shadow-[0_0_8px_theme(colors.mode.chat/0.4)]",
  agent: "bg-mode-agent shadow-[0_0_8px_theme(colors.mode.agent/0.4)]",
  plan: "bg-mode-plan shadow-[0_0_8px_theme(colors.mode.plan/0.4)]",
  yolo: "bg-mode-yolo shadow-[0_0_8px_theme(colors.mode.yolo/0.4)]",
  background: "bg-mode-chat shadow-[0_0_8px_theme(colors.mode.chat/0.4)]",
};

function StatusBar() {
  const status = useConnectionStore((s) => s.status);
  const isConnected = status === "connected";

  // Select primitives to avoid infinite re-renders (no new object refs)
  const tabs = useChatStore((s) => s.tabs);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const mode = activeTab?.mode ?? "chat";
  const messageCount = activeTab?.messages?.length ?? 0;

  const selectedModelId = useConfigStore((s) => s.selectedModelId);
  const models = useConfigStore((s) => s.models);
  const selectedModel = models.find((m) => m.id === selectedModelId);
  const modelName = selectedModel?.name ?? "";

  return (
    <footer className="glass border-border-glass text-text-secondary flex h-[28px] shrink-0 select-none items-center justify-between border-t px-4 text-xs">
      {/* Connection indicator */}
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
            isConnected
              ? "bg-mode-agent shadow-[0_0_4px_theme(colors.mode.agent)]"
              : "bg-red-500 shadow-[0_0_4px_theme(colors.red.500)]"
          }`}
        />
        <span className="capitalize">{status}</span>
      </div>

      {/* Active model */}
      <span className="text-text-tertiary max-w-[40%] truncate text-center font-mono text-[10px]">
        {modelName}
      </span>

      {/* Mode badge + message count */}
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white transition-all duration-200 ${
            MODE_COLOUR[mode] ?? MODE_COLOUR.chat
          }`}
        >
          {mode}
        </span>
        {messageCount > 0 && (
          <span className="glass-subtle rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
            {messageCount}
          </span>
        )}
      </div>
    </footer>
  );
}

export default StatusBar;
