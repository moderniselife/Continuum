/**
 * ModeSelector — Horizontal pill button group for selecting chat mode.
 * Supports Chat, Agent, Plan modes, plus a YOLO toggle that overlays
 * any mode with auto-apply behaviour.
 */

import { useChatStore } from "@/stores/chatStore";
import type { ChatMode } from "@/api/types";

const modes: { id: ChatMode; label: string; emoji: string }[] = [
  { id: "chat", label: "Chat", emoji: "💬" },
  { id: "agent", label: "Agent", emoji: "🤖" },
  { id: "plan", label: "Plan", emoji: "📋" },
];

/** Maps each mode ID to its corresponding Tailwind background class. */
const modeColourMap: Record<string, string> = {
  chat: "bg-mode-chat",
  agent: "bg-mode-agent",
  plan: "bg-mode-plan",
};

const ModeSelector = () => {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const activeTab = useChatStore((s) => s.getActiveTab());
  const mode = activeTab?.mode ?? "chat";
  const isYolo = activeTab?.yoloMode ?? false;
  const setMode = useChatStore((s) => s.setMode);
  const toggleYoloMode = useChatStore((s) => s.toggleYoloMode);

  return (
    <div className="flex items-center gap-1">
      {modes.map((m) => {
        const isActive = mode === m.id;

        return (
          <button
            key={m.id}
            onClick={() => {
              if (activeTabId) {
                setMode(activeTabId, m.id);
              }
            }}
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

      {/* YOLO toggle — separate from chat mode */}
      <button
        onClick={() => {
          if (activeTabId) {
            toggleYoloMode(activeTabId);
          }
        }}
        className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
          isYolo
            ? "bg-mode-yolo text-white shadow-sm"
            : "bg-bg-elevated hover:bg-bg-hover text-text-secondary"
        } `}
      >
        <span>🔥</span>
        <span>YOLO</span>
      </button>
    </div>
  );
};

export default ModeSelector;
