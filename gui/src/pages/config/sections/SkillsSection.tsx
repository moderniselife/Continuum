/**
 * SkillsSection — Config page section for managing skills in the
 * VS Code extension.
 *
 * Discovers skills from .continuum/skills/ and .continue/skills/
 * directories and displays them with expand/view, edit (opens in editor),
 * create and delete functionality.
 *
 * Mirrors the RulesSection pattern using the same UI primitives.
 *
 * @module pages/config/sections/SkillsSection
 */

import {
  ArrowsPointingOutIcon,
  FolderIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { BoltIcon } from "@heroicons/react/24/solid";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import ConfirmationDialog from "../../../components/dialogs/ConfirmationDialog";
import HeaderButtonWithToolTip from "../../../components/gui/HeaderButtonWithToolTip";
import { Card, EmptyState } from "../../../components/ui";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch } from "../../../redux/hooks";
import { setDialogMessage, setShowDialog } from "../../../redux/slices/uiSlice";
import { fontSize } from "../../../util";
import { ConfigHeader } from "../components/ConfigHeader";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillEntry {
  name: string;
  description: string;
  path: string;
  content: string;
  source: "workspace" | "global";
}

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line
        .slice(idx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      fm[key] = val;
    }
  }
  return { frontmatter: fm, body: match[2].trim() };
}

// ---------------------------------------------------------------------------
// Skill Card
// ---------------------------------------------------------------------------

interface SkillCardProps {
  skill: SkillEntry;
  onDelete: (skill: SkillEntry) => void;
  onEdit: (skill: SkillEntry) => void;
}

const SkillCard: React.FC<SkillCardProps> = ({ skill, onDelete, onEdit }) => {
  const dispatch = useAppDispatch();
  const smallFont = fontSize(-2);
  const tinyFont = fontSize(-3);

  function onClickExpand() {
    dispatch(setShowDialog(true));
    dispatch(
      setDialogMessage(
        <div className="max-h-4/5 p-4">
          <h3>{skill.name}</h3>
          <p className="mb-2 text-sm text-gray-400">{skill.description}</p>
          <pre className="max-w-full overflow-scroll whitespace-pre-wrap">
            {skill.content}
          </pre>
        </div>,
      ),
    );
  }

  return (
    <div className="border-border flex flex-col rounded-sm px-2 py-1.5 transition-colors">
      <div className="flex flex-col">
        <div className="flex flex-row justify-between gap-1">
          <div className="flex items-center gap-1.5">
            <BoltIcon className="h-3 w-3 text-amber-400" />
            <span
              className="text-vsc-foreground line-clamp-2"
              style={{ fontSize: smallFont }}
            >
              {skill.name}
            </span>
          </div>
          <div className="flex flex-row items-center gap-1">
            <span
              className="rounded-sm bg-gray-700 px-1.5 py-0.5 text-gray-300"
              style={{ fontSize: tinyFont }}
            >
              {skill.source}
            </span>
            <div className="flex flex-row items-start gap-1">
              <HeaderButtonWithToolTip onClick={onClickExpand} text="Expand">
                <ArrowsPointingOutIcon className="h-3 w-3 text-gray-400" />
              </HeaderButtonWithToolTip>
              <HeaderButtonWithToolTip
                onClick={() => onEdit(skill)}
                text="Edit in editor"
              >
                <PencilIcon className="h-3 w-3 text-gray-400" />
              </HeaderButtonWithToolTip>
              <HeaderButtonWithToolTip
                onClick={() => onDelete(skill)}
                text="Delete"
              >
                <TrashIcon className="h-3 w-3 text-gray-400" />
              </HeaderButtonWithToolTip>
            </div>
          </div>
        </div>

        <span
          style={{ fontSize: tinyFont }}
          className="mt-1 line-clamp-2 text-gray-400"
        >
          {skill.description}
        </span>

        <span
          style={{ fontSize: tinyFont }}
          className="mt-1 line-clamp-3 text-gray-500"
        >
          {skill.content}
        </span>

        <div className="mt-1.5 flex items-center gap-1.5">
          <FolderIcon className="h-2.5 w-2.5 text-gray-500" />
          <span style={{ fontSize: tinyFont }} className="italic text-gray-500">
            {skill.path}
          </span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create Skill Form
// ---------------------------------------------------------------------------

interface CreateSkillFormProps {
  onSubmit: (data: {
    name: string;
    description: string;
    content: string;
    scope: "workspace" | "global";
  }) => void;
  onCancel: () => void;
}

const CreateSkillForm: React.FC<CreateSkillFormProps> = ({
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<"workspace" | "global">("workspace");
  const smallFont = fontSize(-2);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      content,
      scope,
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-600 p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Skill name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-sm border border-gray-600 bg-transparent px-2 py-1 text-sm outline-none focus:border-gray-400"
          style={{ fontSize: smallFont }}
          autoFocus
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "workspace" | "global")}
          className="rounded-sm border border-gray-600 bg-transparent px-2 py-1 text-sm outline-none"
          style={{ fontSize: smallFont }}
        >
          <option value="workspace">Workspace</option>
          <option value="global">Global</option>
        </select>
      </div>
      <input
        type="text"
        placeholder="Description — when should this skill be used?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="rounded-sm border border-gray-600 bg-transparent px-2 py-1 text-sm outline-none focus:border-gray-400"
        style={{ fontSize: smallFont }}
      />
      <textarea
        placeholder="Skill instructions (markdown)..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        className="resize-y rounded-sm border border-gray-600 bg-transparent px-2 py-1 font-mono text-sm outline-none focus:border-gray-400"
        style={{ fontSize: smallFont }}
      />
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-sm px-3 py-1 text-xs text-gray-400 hover:text-gray-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="rounded-sm bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Create Skill
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SkillsSection (exported)
// ---------------------------------------------------------------------------

export function SkillsSection() {
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  /**
   * Discover skills by scanning standard directories via the IDE's
   * filesystem APIs. Uses ideMessenger.ide for reading.
   */
  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const workspaceDirs = await ideMessenger.ide.getWorkspaceDirs();
      const found: SkillEntry[] = [];

      // Scan both .continuum/skills and .continue/skills in each workspace
      const suffixes = [".continuum/skills", ".continue/skills"];

      for (const wsDir of workspaceDirs) {
        for (const suffix of suffixes) {
          const skillsDir = `${wsDir}/${suffix}`;
          try {
            const entries = await ideMessenger.ide.listDir(skillsDir);
            if (!entries?.length) continue;

            for (const [entryName, entryType] of entries) {
              if (entryType !== 2 /* Directory */) continue;

              try {
                const skillMdPath = `${skillsDir}/${entryName}/SKILL.md`;
                const raw = await ideMessenger.ide.readFile(skillMdPath);
                if (!raw) continue;

                const { frontmatter, body } = parseFrontmatter(raw);

                found.push({
                  name: frontmatter.name || entryName,
                  description: frontmatter.description || "",
                  path: `${skillsDir}/${entryName}`,
                  content: body,
                  source: "workspace",
                });
              } catch {
                // SKILL.md might not exist
              }
            }
          } catch {
            // Directory doesn't exist — skip
          }
        }
      }

      // Also scan global config (~/.continuum/skills)
      // We can't easily get the home directory from the IDE interface,
      // so we skip global skills scanning in the extension. Users can
      // manage global skills via the file system or the Web IDE.
      // This is consistent with how rules work — global rules are
      // discovered by the core, not the GUI directly.

      setSkills(found);
    } catch (err) {
      console.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  }, [ideMessenger]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleDelete = useCallback(
    (skill: SkillEntry) => {
      dispatch(
        setDialogMessage(
          <ConfirmationDialog
            title="Delete Skill"
            text={`Are you sure you want to delete the skill "${skill.name}"? This will remove the entire skill directory.`}
            confirmText="Delete"
            onConfirm={async () => {
              try {
                // Delete the SKILL.md at minimum — full directory removal
                // is done by the IDE through the filesystem provider
                await ideMessenger.ide.removeFile(`${skill.path}/SKILL.md`);
                setSkills((prev) => prev.filter((s) => s.path !== skill.path));
              } catch (error) {
                console.error("Failed to delete skill:", error);
              }
            }}
          />,
        ),
      );
      dispatch(setShowDialog(true));
    },
    [dispatch, ideMessenger],
  );

  const handleEdit = useCallback(
    (skill: SkillEntry) => {
      ideMessenger.post("openFile", { path: `${skill.path}/SKILL.md` });
    },
    [ideMessenger],
  );

  const handleCreate = useCallback(
    async (data: {
      name: string;
      description: string;
      content: string;
      scope: "workspace" | "global";
    }) => {
      try {
        const slug = data.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        let basePath: string;

        if (data.scope === "global") {
          // For global skills, place alongside workspace — user can move later
          const workspaceDirs = await ideMessenger.ide.getWorkspaceDirs();
          basePath = `${workspaceDirs[0] || "."}/../../.continuum/skills/${slug}`;
        } else {
          const workspaceDirs = await ideMessenger.ide.getWorkspaceDirs();
          basePath = `${workspaceDirs[0] || "."}/.continuum/skills/${slug}`;
        }

        const skillMdContent = `---\nname: ${data.name}\ndescription: ${data.description}\n---\n\n${data.content}\n`;

        // Write the SKILL.md file — this will create parent directories
        await ideMessenger.ide.writeFile(
          `${basePath}/SKILL.md`,
          skillMdContent,
        );

        setShowCreateForm(false);

        // Open the newly created file in the editor
        ideMessenger.post("openFile", { path: `${basePath}/SKILL.md` });

        // Refresh
        void loadSkills();
      } catch (error) {
        console.error("Failed to create skill:", error);
      }
    },
    [ideMessenger, loadSkills],
  );

  const sortedSkills = useMemo(() => {
    return [...skills].sort((a, b) => {
      if (a.source !== b.source) return a.source === "workspace" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [skills]);

  return (
    <>
      <ConfigHeader
        title="Skills"
        subtext="Skills are reusable instruction sets that extend your assistant's capabilities"
        onAddClick={() => setShowCreateForm(!showCreateForm)}
        addButtonTooltip="Create a new skill"
      />

      {showCreateForm && (
        <div className="mb-4">
          <CreateSkillForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      <Card>
        {loading ? (
          <div className="px-2 py-3 text-xs text-gray-400">
            Discovering skills...
          </div>
        ) : sortedSkills.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sortedSkills.map((skill) => (
              <SkillCard
                key={skill.path}
                skill={skill}
                onDelete={handleDelete}
                onEdit={handleEdit}
              />
            ))}
          </div>
        ) : (
          <EmptyState message="No skills found. Click the + button to create your first skill, or add SKILL.md files to .continuum/skills/ in your workspace." />
        )}
      </Card>
    </>
  );
}
