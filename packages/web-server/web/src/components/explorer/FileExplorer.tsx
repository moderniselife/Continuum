/**
 * FileExplorer — Left-hand file tree panel for the Continuum Web IDE.
 *
 * Displays:
 * - Header with workspace name + git branch badge
 * - New File / New Folder action buttons
 * - Search/filter input
 * - Scrollable tree of `<FileTreeItem />` nodes
 *
 * On mount: loads workspace metadata then fetches the root directory listing.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { FilePlus, FolderPlus, GitBranch, Search } from "lucide-react";
import { useFileStore, type FileNode } from "@/stores/fileStore";
import FileTreeItem from "./FileTreeItem";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the workspace display name (basename of the first workspace dir).
 */
function workspaceDisplayName(dirs: string[]): string {
  if (dirs.length === 0) return "Workspace";
  const first = dirs[0];
  return first.split("/").filter(Boolean).pop() ?? "Workspace";
}

/**
 * Recursively filter file tree nodes by a search query (case-insensitive).
 * A directory is included if it (or any descendant) matches.
 */
function filterTree(nodes: FileNode[], query: string): FileNode[] {
  const lower = query.toLowerCase();
  return nodes.reduce<FileNode[]>((acc, node) => {
    const nameMatches = node.name.toLowerCase().includes(lower);

    if (node.type === "directory" && node.children) {
      const filteredChildren = filterTree(node.children, query);
      if (nameMatches || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
    } else if (nameMatches) {
      acc.push(node);
    }

    return acc;
  }, []);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function FileExplorer() {
  const workspaceDirs = useFileStore((s) => s.workspaceDirs);
  const gitBranch = useFileStore((s) => s.gitBranch);
  const fileTree = useFileStore((s) => s.fileTree);
  const loadWorkspace = useFileStore((s) => s.loadWorkspace);
  const loadDir = useFileStore((s) => s.loadDir);
  const createItem = useFileStore((s) => s.createItem);

  const [filterQuery, setFilterQuery] = useState("");
  const [isCreating, setIsCreating] = useState<"file" | "directory" | null>(
    null,
  );
  const [newItemName, setNewItemName] = useState("");

  // Load workspace on mount
  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Load root directory once workspace dirs are available
  useEffect(() => {
    if (workspaceDirs.length > 0) {
      loadDir(workspaceDirs[0]);
    }
  }, [workspaceDirs, loadDir]);

  const displayName = useMemo(
    () => workspaceDisplayName(workspaceDirs),
    [workspaceDirs],
  );

  const filteredTree = useMemo(
    () => (filterQuery ? filterTree(fileTree, filterQuery) : fileTree),
    [fileTree, filterQuery],
  );

  const handleCreate = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && newItemName.trim() && isCreating) {
        const parentDir = workspaceDirs[0] ?? "/";
        await createItem(parentDir, newItemName.trim(), isCreating);
        setNewItemName("");
        setIsCreating(null);
      } else if (e.key === "Escape") {
        setNewItemName("");
        setIsCreating(null);
      }
    },
    [createItem, isCreating, newItemName, workspaceDirs],
  );

  return (
    <div className="glass-heavy border-border-glass flex h-full flex-col overflow-hidden border-r">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-text-primary truncate text-sm font-semibold">
            {displayName}
          </span>

          {/* Git branch badge */}
          {gitBranch && (
            <span className="bg-accent-muted text-accent flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
              <GitBranch size={11} />
              {gitBranch}
            </span>
          )}
        </div>

        {/* New File / New Folder */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setIsCreating("file")}
            className="text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded p-1 transition-colors"
            title="New file"
          >
            <FilePlus size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsCreating("directory")}
            className="text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded p-1 transition-colors"
            title="New folder"
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      {/* ── Search / Filter ───────────────────────────────────── */}
      <div className="relative px-2 py-1.5">
        <Search
          size={13}
          className="text-text-tertiary pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
        />
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter files…"
          className="glass-input w-full rounded-md py-1 pl-7 pr-2 text-xs"
        />
      </div>

      {/* ── Inline create input ───────────────────────────────── */}
      {isCreating && (
        <div className="animate-fade-in border-border border-b px-3 py-1.5">
          <input
            type="text"
            autoFocus
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={handleCreate}
            onBlur={() => setIsCreating(null)}
            placeholder={isCreating === "file" ? "filename.ts" : "folder-name"}
            className="glass-input w-full rounded-md px-2 py-1 text-xs"
          />
          <p className="text-text-tertiary mt-0.5 text-[10px]">
            Press Enter to create, Escape to cancel
          </p>
        </div>
      )}

      {/* ── File tree ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {filteredTree.length > 0 ? (
          filteredTree.map((node) => (
            <FileTreeItem key={node.path} node={node} depth={0} />
          ))
        ) : (
          <p className="text-text-tertiary px-3 py-4 text-center text-xs">
            {filterQuery ? "No matching files" : "No files loaded"}
          </p>
        )}
      </div>
    </div>
  );
}

export default FileExplorer;
