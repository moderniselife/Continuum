/**
 * ModeSelector — Horizontal pill button group for selecting chat mode.
 * Supports Chat, Agent, Plan, and YOLO modes with colour-coded pills.
 */

import { useChatStore } from "@/stores/chatStore";

const modes = [
  { id: "chat", label: "Chat", emoji: "💬" },
  { id: "agent", label: "Agent", emoji: "🤖" },
  { id: "plan", label: "Plan", emoji: "📋" },
  { id: "yolo", label: "YOLO", emoji: "🔥" },
] as const;

/** Maps each mode ID to its corresponding Tailwind background class. */
const modeColourMap: Record<string, string> = {
  chat: "bg-mode-chat",
  agent: "bg-mode-agent",
  plan: "bg-mode-plan",
  yolo: "bg-mode-yolo",
};

const ModeSelector = () => {
  const mode = useChatStore((s) => s.mode);
  const setMode = useChatStore((s) => s.setMode);

  return (
    <div className="flex items-center gap-1">
      {modes.map((m) => {
        const isActive = mode === m.id;

        return (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
              isActive
                ? `${modeColourMap[m.id]} text-white shadow-sm`
                : "bg-bg-elevated hover:bg-bg-hover text-text-secondary"
            } `}
          >
            <span>{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ModeSelector;
