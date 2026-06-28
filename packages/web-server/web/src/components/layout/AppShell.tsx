/**
 * AppShell — Root application shell for the Continuum Web IDE.
 *
 * Composes the TitleBar, Sidebar, ChatPanel, and StatusBar into
 * a full-screen Liquid Glass IDE layout with animated nebula background.
 */

import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import StatusBar from "./StatusBar";
import ChatPanel from "@/components/chat/ChatPanel";
import SettingsPanel from "@/components/settings/SettingsPanel";

function AppShell() {
  return (
    <div className="bg-nebula relative flex h-screen flex-col overflow-hidden">
      {/* Title bar */}
      <TitleBar />

      {/* Main content area: sidebar + chat panel */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <ChatPanel />
        </main>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Settings overlay — rendered above everything */}
      <SettingsPanel />
    </div>
  );
}

export default AppShell;
