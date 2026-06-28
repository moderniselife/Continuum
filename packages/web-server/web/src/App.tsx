import { useEffect } from "react";
import AppShell from "./components/layout/AppShell";
import { useConnectionStore } from "./stores/connectionStore";
import { useSessionStore } from "./stores/sessionStore";
import { useConfigStore } from "./stores/configStore";

/**
 * Root application component for the Continuum Web IDE.
 *
 * Initialises the WebSocket connection, loads sessions and config
 * on mount, then renders the main layout shell.
 */
export default function App() {
  const connect = useConnectionStore((s) => s.connect);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const loadModels = useConfigStore((s) => s.loadModels);

  useEffect(() => {
    // Boot sequence: connect WS, then load data
    connect();
    loadSessions();
    loadModels();
  }, [connect, loadSessions, loadModels]);

  return <AppShell />;
}
