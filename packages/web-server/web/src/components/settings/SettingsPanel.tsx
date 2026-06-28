/**
 * SettingsPanel — Slide-over settings panel with Liquid Glass design.
 *
 * Tabs: Config (Monaco YAML editor), Models, General, About.
 * Opens from the right side with glass backdrop overlay.
 */

import { getConfigPath, getRawConfig, saveRawConfig } from "@/api/rest";
import { useConfigStore } from "@/stores/configStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useUIStore, type SettingsTab } from "@/stores/uiStore";
import Editor from "@monaco-editor/react";
import {
  AlertTriangle,
  Check,
  Cpu,
  FileCode2,
  Info,
  Save,
  Settings2,
  Shield,
  Sparkles,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const TABS: { id: SettingsTab; label: string; icon: typeof FileCode2 }[] = [
  { id: "config", label: "Config", icon: FileCode2 },
  { id: "models", label: "Models", icon: Cpu },
  { id: "general", label: "General", icon: Settings2 },
  { id: "about", label: "About", icon: Info },
];

function SettingsPanel() {
  const { settingsPanelOpen, settingsTab, setSettingsTab, closeSettings } =
    useUIStore();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && settingsPanelOpen) closeSettings();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsPanelOpen, closeSettings]);

  if (!settingsPanelOpen) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="settings-overlay animate-fade-in fixed inset-0 z-40"
        onClick={closeSettings}
      />

      {/* Panel */}
      <div className="glass-heavy animate-slide-in-right border-border-glass fixed bottom-0 right-0 top-0 z-50 flex w-[560px] max-w-[90vw] flex-col border-l shadow-2xl">
        {/* Header */}
        <div className="border-border-glass flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-text-primary flex items-center gap-2 text-base font-semibold">
            <Settings2 size={18} className="text-accent" />
            Settings
          </h2>
          <button
            type="button"
            onClick={closeSettings}
            className="text-text-secondary hover:bg-bg-hover hover:text-text-primary rounded-lg p-1.5 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="border-border-glass flex gap-1 border-b px-4 py-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                settingsTab === tab.id
                  ? "bg-accent-muted text-accent glow-accent"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {settingsTab === "config" && <ConfigTab />}
          {settingsTab === "models" && <ModelsTab />}
          {settingsTab === "general" && <GeneralTab />}
          {settingsTab === "about" && <AboutTab />}
        </div>
      </div>
    </>
  );
}

/* ── Config Tab — Monaco YAML Editor ─────────────────────── */

function ConfigTab() {
  const [content, setContent] = useState("");
  const [configPath, setConfigPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [dirty, setDirty] = useState(false);

  // Load config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [raw, pathResult] = await Promise.all([
          getRawConfig(),
          getConfigPath(),
        ]);
        if (!cancelled) {
          setContent(raw);
          setConfigPath(pathResult);
        }
      } catch (err) {
        console.error("[SettingsPanel] Failed to load config:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const result = await saveRawConfig(content);
      if (result.updated) {
        setSaveResult({
          ok: true,
          message: "Configuration saved successfully",
        });
        setDirty(false);
      } else {
        setSaveResult({
          ok: false,
          message: result.details ?? result.error ?? "Failed to save",
        });
      }
    } catch (err) {
      setSaveResult({
        ok: false,
        message: (err as Error).message,
      });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 4000);
    }
  }, [content]);

  // Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  return (
    <div className="flex h-full flex-col">
      {/* File path + save */}
      <div className="border-border-glass flex items-center justify-between border-b px-4 py-2">
        <span className="text-text-tertiary font-mono text-xs">
          {configPath || "~/.continue/config.yaml"}
        </span>
        <div className="flex items-center gap-2">
          {saveResult && (
            <span
              className={`flex items-center gap-1 text-xs ${
                saveResult.ok ? "text-success" : "text-error"
              }`}
            >
              {saveResult.ok ? (
                <Check size={12} />
              ) : (
                <AlertTriangle size={12} />
              )}
              {saveResult.message}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
              dirty
                ? "gradient-accent hover:glow-accent text-white"
                : "bg-bg-elevated text-text-tertiary"
            } disabled:opacity-50`}
          >
            <Save size={12} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="px-4 py-1 text-right">
        <span className="text-text-tertiary text-[10px]">⌘S to save</span>
      </div>

      {/* Monaco editor */}
      <div className="monaco-container flex-1 px-3 pb-3">
        <Editor
          height="100%"
          defaultLanguage="yaml"
          value={content}
          onChange={(value) => {
            setContent(value ?? "");
            setDirty(true);
          }}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "gutter",
            bracketPairColorization: { enabled: true },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            roundedSelection: true,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}

/* ── Models Tab ──────────────────────────────────────────── */

function ModelsTab() {
  const models = useConfigStore((s) => s.models);

  return (
    <div className="space-y-3 p-4">
      <p className="text-text-secondary text-xs">
        Models configured in your{" "}
        <code className="bg-bg-elevated text-accent rounded px-1 py-0.5 font-mono">
          config.yaml
        </code>
      </p>
      {models.length === 0 ? (
        <div className="glass-subtle flex flex-col items-center gap-2 rounded-xl py-8 text-center">
          <Cpu size={24} className="text-text-tertiary" />
          <p className="text-text-secondary text-sm">No models configured</p>
        </div>
      ) : (
        models.map((model, i) => (
          <div
            key={model.title ?? model.name ?? i}
            className="glass-subtle glass-shine hover:bg-bg-hover flex items-start gap-3 rounded-xl p-3 transition-all"
          >
            <div className="bg-accent-muted mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg">
              <Sparkles size={16} className="text-accent" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-text-primary text-sm font-medium">
                  {model.title ?? model.name}
                </span>
                <span className="bg-bg-elevated text-text-tertiary rounded-full px-2 py-0.5 text-[10px] font-medium">
                  {model.provider}
                </span>
              </div>
              {model.model && (
                <p className="text-text-tertiary mt-0.5 font-mono text-xs">
                  {model.model}
                </p>
              )}
              {model.roles && model.roles.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {model.roles.map((role: string) => (
                    <span
                      key={role}
                      className="bg-bg-elevated text-text-secondary flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                    >
                      {role === "chat" && <Zap size={9} />}
                      {role === "edit" && <Wrench size={9} />}
                      {role === "apply" && <Shield size={9} />}
                      {role}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ── General Tab ─────────────────────────────────────────── */

function GeneralTab() {
  const status = useConnectionStore((s) => s.status);
  const isConnected = status === "connected";
  const sessions = useSessionStore((s) => s.sessions);

  return (
    <div className="space-y-3 p-4">
      <InfoRow
        label="Connection"
        value={isConnected ? "Connected" : "Disconnected"}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            isConnected ? "bg-success animate-pulse-glow" : "bg-error"
          }`}
        />
      </InfoRow>
      <InfoRow label="Total Sessions" value={String(sessions.length)} />
      <InfoRow label="Config Location" value="~/.continue/config.yaml" />
      <InfoRow label="Sessions Location" value="~/.continue/sessions/" />
    </div>
  );
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="glass-subtle flex items-center justify-between rounded-xl px-4 py-3">
      <span className="text-text-secondary text-sm">{label}</span>
      <div className="flex items-center gap-2">
        {children}
        <span className="text-text-primary text-sm font-medium">{value}</span>
      </div>
    </div>
  );
}

/* ── About Tab ───────────────────────────────────────────── */

function AboutTab() {
  return (
    <div className="space-y-4 p-4">
      <div className="glass-subtle glass-shine flex flex-col items-center gap-3 rounded-xl py-8">
        <span className="text-4xl">⚡</span>
        <h3 className="text-text-primary text-lg font-bold">Continuum</h3>
        <p className="text-text-secondary text-sm">Open-source AI code agent</p>
        <span className="bg-bg-elevated text-text-tertiary rounded-full px-3 py-1 font-mono text-xs">
          v1.3.42
        </span>
      </div>

      <div className="space-y-2">
        <a
          href="https://github.com/moderniselife/Continuum"
          target="_blank"
          rel="noopener noreferrer"
          className="glass-subtle hover:bg-bg-hover flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
        >
          <span className="text-text-secondary">GitHub</span>
          <span className="text-accent ml-auto text-xs">→</span>
        </a>
        <a
          href="https://docs.continue.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="glass-subtle hover:bg-bg-hover flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
        >
          <span className="text-text-secondary">Documentation</span>
          <span className="text-accent ml-auto text-xs">→</span>
        </a>
      </div>
    </div>
  );
}

export default SettingsPanel;
