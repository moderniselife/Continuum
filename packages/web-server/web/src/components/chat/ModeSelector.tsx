/**
 * ModeSelector — Horizontal glass pill button group for selecting chat mode.
 *
 * Supports Chat, Agent, Plan modes, plus a YOLO toggle that overlays
 * any mode with auto-apply behaviour. Active pills are filled with
 * their mode colour and display a subtle glow; inactive pills use
 * glass-subtle styling.
 *
 * @remarks Uses the Liquid Glass design language.
 */

import { MessageCircle, Bot, ClipboardList, Flame } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import type { ChatMode } from "@/api/types";

/** Mode metadata including Tailwind colour classes and lucide icons. */
const modes: {
  id: ChatMode;
  label: string;
  icon: React.ElementType;
  bgClass: string;
  glowClass: string;
}[] = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageCircle,
    bgClass: "bg-mode-chat",
    glowClass: "shadow-[0_0_12px_rgba(0,255,135,0.35)]",
  },
  {
    id: "agent",
    label: "Agent",
    icon: Bot,
    bgClass: "bg-mode-agent",
    glowClass: "shadow-[0_0_12px_rgba(86,200,255,0.35)]",
  },
  {
    id: "plan",
    label: "Plan",
    icon: ClipboardList,
    bgClass: "bg-mode-plan",
    glowClass: "shadow-[0_0_12px_rgba(255,179,71,0.35)]",
  },
];

const ModeSelector = () => {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const tabs = useChatStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const mode = activeTab?.mode ?? "chat";
  const isYolo = activeTab?.yoloMode ?? false;
  const setMode = useChatStore((s) => s.setMode);
  const toggleYoloMode = useChatStore((s) => s.toggleYoloMode);

  return (
    <div className="flex items-center gap-1.5">
      {modes.map((m) => {
        const isActive = mode === m.id;
        const Icon = m.icon;

        return (
          <button
            key={m.id}
            onClick={() => {
              if (activeTabId) setMode(activeTabId, m.id);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
              isActive
                ? `${m.bgClass} ${m.glowClass} text-white`
                : "glass-subtle text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <Icon size={13} />
            <span>{m.label}</span>
          </button>
        );
      })}

      {/* Divider */}
      <div className="bg-border-glass mx-0.5 h-4 w-px" />

      {/* YOLO toggle — separate from chat mode */}
      <button
        onClick={() => {
          if (activeTabId) toggleYoloMode(activeTabId);
        }}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
          isYolo
            ? "gradient-yolo text-white shadow-[0_0_16px_rgba(255,107,53,0.5)]"
            : "glass-subtle text-text-secondary hover:bg-bg-hover"
        }`}
      >
        <Flame size={13} />
        <span>YOLO</span>
      </button>
    </div>
  );
};

export default ModeSelector;
