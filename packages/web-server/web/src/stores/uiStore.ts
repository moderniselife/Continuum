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
}));
