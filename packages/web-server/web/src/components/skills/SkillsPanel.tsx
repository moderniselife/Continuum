/**
 * SkillsPanel — Left-hand panel for browsing and managing agent skills.
 *
 * Displays skills with expandable content, file listings, source badges,
 * and an inline creation form.
 *
 * @module components/skills/SkillsPanel
 */

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Zap,
  Globe,
  FolderDot,
  FileCode,
  FileText,
  File,
} from "lucide-react";
import { useSkillsStore } from "@/stores/skillsStore";
import { useFileStore } from "@/stores/fileStore";
import type { Skill, SkillFile, SkillSource } from "@/api/skills";

// ---------------------------------------------------------------------------
// Source configuration
// ---------------------------------------------------------------------------

interface SourceConfig {
  label: string;
  badgeColour: string;
}

const SOURCE_CONFIG: Record<SkillSource, SourceConfig> = {
  workspace: {
    label: "Workspace",
    badgeColour: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  global: {
    label: "Global",
    badgeColour: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get an icon based on file extension. */
function fileIcon(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go"].includes(ext)) {
    return FileCode;
  }
  if ([".md", ".mdx", ".txt"].includes(ext)) {
    return FileText;
  }
  return File;
}

/** Format file size in a human-readable way. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Supporting file entry that can be clicked to open in editor. */
function SkillFileItem({ file }: { file: SkillFile }) {
  const openFile = useFileStore((s) => s.openFile);
  const Icon = fileIcon(file.name);

  return (
    <button
      type="button"
      onClick={() => openFile(file.path)}
      className="hover:bg-bg-hover flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
    >
      <Icon size={13} className="text-text-tertiary shrink-0" />
      <span className="text-text-secondary min-w-0 flex-1 truncate text-xs">
        {file.name}
      </span>
      <span className="text-text-tertiary shrink-0 font-mono text-[10px]">
        {formatSize(file.size)}
      </span>
    </button>
  );
}

/** Individual skill card with expand/collapse and detail loading. */
function SkillCard({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const selectSkill = useSkillsStore((s) => s.selectSkill);
  const activeSkill = useSkillsStore((s) => s.activeSkill);
  const loadingDetail = useSkillsStore((s) => s.loadingDetail);
  const deleteSkill = useSkillsStore((s) => s.deleteSkill);

  const config = SOURCE_CONFIG[skill.source];
  const isActive = activeSkill?.path === skill.path;
  const content = isActive ? activeSkill?.content : skill.content;

  const handleExpand = useCallback(async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand && !content) {
      await selectSkill(skill.path);
    }
  }, [expanded, content, selectSkill, skill.path]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) {
        deleteSkill(skill.path);
      }
    },
    [deleteSkill, skill.name, skill.path],
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
        onClick={handleExpand}
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
              {skill.name}
            </span>
            <span
              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${config.badgeColour}`}
            >
              {config.label}
            </span>
            {skill.files.length > 0 && (
              <span className="glass-subtle text-text-tertiary shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
                {skill.files.length} file{skill.files.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-text-tertiary truncate text-xs">
              {skill.description}
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
          title="Delete skill"
        >
          <Trash2 size={13} />
        </button>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-border animate-fade-in border-t px-3 py-2">
          {/* Loading state for detail */}
          {loadingDetail && isActive && (
            <div className="flex items-center justify-center py-4">
              <div className="border-accent h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
            </div>
          )}

          {/* SKILL.md content */}
          {content && (
            <div className="mb-2">
              <span className="text-text-tertiary text-[10px] font-medium uppercase tracking-wider">
                SKILL.md
              </span>
              <pre className="glass text-text-secondary mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg p-3 font-mono text-xs leading-relaxed">
                {content}
              </pre>
            </div>
          )}

          {/* Supporting files */}
          {skill.files.length > 0 && (
            <div>
              <span className="text-text-tertiary text-[10px] font-medium uppercase tracking-wider">
                Supporting Files
              </span>
              <div className="mt-1 space-y-0.5">
                {skill.files.map((file) => (
                  <SkillFileItem key={file.path} file={file} />
                ))}
              </div>
            </div>
          )}

          {/* No content fallback */}
          {!content && !loadingDetail && skill.files.length === 0 && (
            <p className="text-text-tertiary py-2 text-xs">
              No content or supporting files
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Skill Form
// ---------------------------------------------------------------------------

function NewSkillForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"workspace" | "global">("workspace");
  const [content, setContent] = useState("");
  const createSkill = useSkillsStore((s) => s.createSkill);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    await createSkill({
      name: name.trim(),
      description: description.trim(),
      source: scope,
      content: content.trim() || undefined,
    });
    onClose();
  }, [name, description, scope, content, createSkill, onClose]);

  return (
    <div className="glass-subtle border-border-glass animate-fade-in mx-0 mb-2 rounded-xl border p-3">
      <div className="mb-3 flex items-center gap-2">
        <Plus size={14} className="text-accent" />
        <span className="text-text-primary text-sm font-medium">New Skill</span>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Skill name"
          className="glass-input w-full rounded-lg px-3 py-1.5 text-xs"
          autoFocus
        />

        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          className="glass-input w-full rounded-lg px-3 py-1.5 text-xs"
        />

        {/* Scope picker */}
        <div className="flex items-center gap-3">
          <span className="text-text-tertiary text-xs">Scope:</span>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              name="skillScope"
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
              name="skillScope"
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
          placeholder="SKILL.md content (optional)…"
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
            disabled={!name.trim()}
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

function SkillsPanel() {
  const skills = useSkillsStore((s) => s.skills);
  const loading = useSkillsStore((s) => s.loading);
  const loadSkills = useSkillsStore((s) => s.loadSkills);
  const [showNewForm, setShowNewForm] = useState(false);

  // Load skills on mount
  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-accent" />
          <span className="text-text-primary text-sm font-semibold">
            Skills
          </span>
          {skills.length > 0 && (
            <span className="glass-subtle text-text-tertiary rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
              {skills.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm(!showNewForm)}
          className="bg-accent/90 hover:bg-accent flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-black transition-colors"
        >
          <Plus size={12} />
          New Skill
        </button>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* New skill form */}
        {showNewForm && <NewSkillForm onClose={() => setShowNewForm(false)} />}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="border-accent h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        )}

        {/* Empty state */}
        {!loading && skills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="glass-subtle mb-3 flex h-12 w-12 items-center justify-center rounded-xl">
              <Zap size={24} className="text-text-tertiary" />
            </div>
            <p className="text-text-secondary mb-1 text-sm font-medium">
              No skills found
            </p>
            <p className="text-text-tertiary mb-3 text-xs">
              Skills extend agent capabilities with specialised instructions
            </p>
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="bg-accent/90 hover:bg-accent flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-black transition-colors"
            >
              <Plus size={12} />
              Create your first skill
            </button>
          </div>
        )}

        {/* Skills list */}
        {!loading &&
          skills.map((skill) => <SkillCard key={skill.path} skill={skill} />)}
      </div>
    </div>
  );
}

export default SkillsPanel;
