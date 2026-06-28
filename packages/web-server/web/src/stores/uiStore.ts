/**
 * uiStore — Global UI state for panels, overlays, and layout toggles.
 */

import { create } from "zustand";

export type SettingsTab = "config" | "models" | "general" | "about";

/** Activity panel identifiers for the left-hand activity bar. */
export type ActivityPanel =
  | "explorer"
  | "search"
  | "git"
  | "history"
  | "rules"
  | "skills"
  | "chat";

interface UIState {
  // -- Settings panel ---
  settingsPanelOpen: boolean;
  settingsTab: SettingsTab;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setSettingsTab: (tab: SettingsTab) => void;

  // -- Sidebar ---
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // -- Activity bar ---
  activeActivity: ActivityPanel;
  setActiveActivity: (activity: ActivityPanel) => void;

  // -- Panel sizes ---
  explorerWidth: number;
  chatPanelWidth: number;
  setExplorerWidth: (width: number) => void;
  setChatPanelWidth: (width: number) => void;

  // -- Chat panel ---
  chatPanelOpen: boolean;
  toggleChatPanel: () => void;

  // -- Terminal ---
  terminalOpen: boolean;
  terminalHeight: number;
  toggleTerminal: () => void;
  setTerminalHeight: (height: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Settings panel
  settingsPanelOpen: false,
  settingsTab: "config",
  openSettings: (tab) =>
    set({ settingsPanelOpen: true, settingsTab: tab ?? "config" }),
  closeSettings: () => set({ settingsPanelOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),

  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Activity bar
  activeActivity: "explorer",
  setActiveActivity: (activity) => set({ activeActivity: activity }),

  // Panel sizes
  explorerWidth: 260,
  chatPanelWidth: 380,
  setExplorerWidth: (width) => set({ explorerWidth: width }),
  setChatPanelWidth: (width) => set({ chatPanelWidth: width }),

  // Chat panel
  chatPanelOpen: true,
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),

  // Terminal
  terminalOpen: false,
  terminalHeight: 200,
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setTerminalHeight: (height) => set({ terminalHeight: height }),
}));
