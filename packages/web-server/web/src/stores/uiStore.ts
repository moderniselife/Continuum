/**
 * uiStore — Global UI state for panels, overlays, and layout toggles.
 */

import { create } from "zustand";

export type SettingsTab = "config" | "models" | "general" | "about";

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

  // -- Terminal ---
  terminalOpen: boolean;
  terminalHeight: number;
  toggleTerminal: () => void;
  setTerminalHeight: (height: number) => void;
  closeTerminal: () => void;
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

  // Terminal
  terminalOpen: false,
  terminalHeight: 240,
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setTerminalHeight: (height) =>
    set({ terminalHeight: Math.max(120, Math.min(height, 600)) }),
  closeTerminal: () => set({ terminalOpen: false }),
}));
