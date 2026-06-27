/**
 * AppShell — Root application shell for the Continuum Web IDE.
 *
 * Composes the TitleBar, Sidebar, ChatPanel, and StatusBar into
 * the full-screen IDE layout.
 */

import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import StatusBar from "./StatusBar";
import ChatPanel from "@/components/chat/ChatPanel";

function AppShell() {
  return (
    <div className="bg-bg-base flex h-screen flex-col">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <ChatPanel />
        </main>
      </div>

      <StatusBar />
    </div>
  );
}

export default AppShell;
