/**
 * RulesPanel — Left-hand panel for managing agent rules.
 *
 * Displays rules grouped by source (Workspace, Global, Colocated, Agent Files)
 * with toggle switches, expandable content, and inline creation form.
 *
 * @module components/rules/RulesPanel
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Globe,
  FolderDot,
  Bot,
  FileText,
} from "lucide-react";
import { useRulesStore } from "@/stores/rulesStore";
import type { Rule, RuleSource } from "@/api/rules";

// ---------------------------------------------------------------------------
// Source configuration
// ---------------------------------------------------------------------------

interface SourceConfig {
  label: string;
  icon: typeof Globe;
  badgeColour: string;
}

const SOURCE_CONFIG: Record<RuleSource, SourceConfig> = {
  workspace: {
    label: "Workspace",
    icon: FolderDot,
    badgeColour: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  global: {
    label: "Global",
    icon: Globe,
    badgeColour: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  colocated: {
    label: "Colocated",
    icon: FileText,
    badgeColour: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  "agent-file": {
    label: "Agent File",
    icon: Bot,
    badgeColour: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
};

const SOURCE_ORDER: RuleSource[] = [
  "workspace",
  "global",
  "colocated",
  "agent-file",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Toggle switch for enabling/disabling a rule. */
function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-accent/80" : "bg-bg-hover"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

/** Individual rule card with expand/collapse. */
function RuleCard({ rule }: { rule: Rule }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const toggleRule = useRulesStore((s) => s.toggleRule);
  const deleteRule = useRulesStore((s) => s.deleteRule);

  const config = SOURCE_CONFIG[rule.source];

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) {
        deleteRule(rule.slug);
      }
    },
    [deleteRule, rule.name, rule.slug],
  );

  return (
    <div
      className="glass-subtle border-border-glass hover:border-border-accent/30 group mb-1.5 rounded-xl border transition-all duration-200"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-text-tertiary shrink-0" />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-text-primary truncate text-sm font-medium">
              {rule.name}
            </span>
            <span
              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${config.badgeColour}`}
            >
              {config.label}
            </span>
          </div>
          {rule.description && (
            <p className="text-text-tertiary truncate text-xs">
              {rule.description}
            </p>
          )}
        </div>

        {/* Delete button (visible on hover) */}
        <button
          type="button"
          onClick={handleDelete}
          className={`shrink-0 rounded p-1 text-red-400 transition-all hover:bg-red-500/10 ${
            hovered ? "opacity-100" : "opacity-0"
          }`}
          title="Delete rule"
        >
          <Trash2 size={13} />
        </button>

        {/* Toggle switch */}
        <ToggleSwitch
          checked={rule.enabled}
          onChange={(val) => toggleRule(rule.slug, val)}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-border animate-fade-in border-t px-3 py-2">
          {rule.globs && rule.globs.length > 0 && (
            <div className="mb-2">
              <span className="text-text-tertiary text-[10px] font-medium uppercase tracking-wider">
                Globs
              </span>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {rule.globs.map((glob) => (
                  <code
                    key={glob}
                    className="glass-subtle rounded px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {glob}
                  </code>
                ))}
              </div>
            </div>
          )}
          <pre className="glass text-text-secondary max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg p-3 font-mono text-xs leading-relaxed">
            {rule.content || "No content"}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Rule Form
// ---------------------------------------------------------------------------

function NewRuleForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"workspace" | "global">("workspace");
  const [content, setContent] = useState("");
  const createRule = useRulesStore((s) => s.createRule);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !content.trim()) return;
    await createRule({
      name: name.trim(),
      source: scope,
      path: "",
      description: description.trim(),
      alwaysApply: false,
      content: content.trim(),
      enabled: true,
    });
    onClose();
  }, [name, description, scope, content, createRule, onClose]);

  return (
    <div className="glass-subtle border-border-glass animate-fade-in mx-2 mb-2 rounded-xl border p-3">
      <div className="mb-3 flex items-center gap-2">
        <Plus size={14} className="text-accent" />
        <span className="text-text-primary text-sm font-medium">New Rule</span>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rule name"
          className="glass-input w-full rounded-lg px-3 py-1.5 text-xs"
          autoFocus
        />

        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="glass-input w-full rounded-lg px-3 py-1.5 text-xs"
        />

        {/* Scope picker */}
        <div className="flex items-center gap-3">
          <span className="text-text-tertiary text-xs">Scope:</span>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              name="ruleScope"
              value="workspace"
              checked={scope === "workspace"}
              onChange={() => setScope("workspace")}
              className="accent-accent"
            />
            <span className="text-text-secondary">Workspace</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              name="ruleScope"
              value="global"
              checked={scope === "global"}
              onChange={() => setScope("global")}
              className="accent-accent"
            />
            <span className="text-text-secondary">Global</span>
          </label>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Rule content (markdown)…"
          rows={6}
          className="glass-input w-full rounded-lg px-3 py-2 font-mono text-xs leading-relaxed"
        />

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-secondary rounded-lg px-3 py-1.5 text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || !content.trim()}
            className="bg-accent/90 hover:bg-accent disabled:bg-accent/30 rounded-lg px-3 py-1.5 text-xs font-medium text-black transition-colors disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function RulesPanel() {
  const rules = useRulesStore((s) => s.rules);
  const rulesBySource = useRulesStore((s) => s.rulesBySource);
  const loading = useRulesStore((s) => s.loading);
  const loadRules = useRulesStore((s) => s.loadRules);
  const [showNewForm, setShowNewForm] = useState(false);

  // Load rules on mount
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Determine which source groups have rules
  const nonEmptySources = useMemo(
    () => SOURCE_ORDER.filter((s) => rulesBySource[s].length > 0),
    [rulesBySource],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-accent" />
          <span className="text-text-primary text-sm font-semibold">Rules</span>
          {rules.length > 0 && (
            <span className="glass-subtle text-text-tertiary rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
              {rules.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm(!showNewForm)}
          className="bg-accent/90 hover:bg-accent flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-black transition-colors"
        >
          <Plus size={12} />
          New Rule
        </button>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* New rule form */}
        {showNewForm && <NewRuleForm onClose={() => setShowNewForm(false)} />}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="border-accent h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        )}

        {/* Empty state */}
        {!loading && rules.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="glass-subtle mb-3 flex h-12 w-12 items-center justify-center rounded-xl">
              <ShieldCheck size={24} className="text-text-tertiary" />
            </div>
            <p className="text-text-secondary mb-1 text-sm font-medium">
              No rules configured
            </p>
            <p className="text-text-tertiary mb-3 text-xs">
              Rules customise agent behaviour and responses
            </p>
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="bg-accent/90 hover:bg-accent flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-black transition-colors"
            >
              <Plus size={12} />
              Create your first rule
            </button>
          </div>
        )}

        {/* Rules grouped by source */}
        {!loading &&
          nonEmptySources.map((source) => {
            const config = SOURCE_CONFIG[source];
            const sourceRules = rulesBySource[source];
            const Icon = config.icon;

            return (
              <div key={source} className="mb-3">
                <div className="flex items-center gap-1.5 px-1 py-1.5">
                  <Icon size={12} className="text-text-tertiary" />
                  <span className="text-text-tertiary text-[10px] font-semibold uppercase tracking-wider">
                    {config.label}
                  </span>
                  <span className="text-text-tertiary text-[10px]">
                    ({sourceRules.length})
                  </span>
                </div>
                {sourceRules.map((rule) => (
                  <RuleCard key={rule.slug} rule={rule} />
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default RulesPanel;
