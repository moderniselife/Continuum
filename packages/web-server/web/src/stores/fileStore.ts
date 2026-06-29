/**
 * fileStore — Global state for the file explorer, open editors, and workspace.
 *
 * Manages the file tree structure, directory expansion, open file tabs,
 * and all file-system mutations (create, delete, rename, save).
 */

import { create } from "zustand";
import {
  getWorkspace,
  listDir,
  readFile,
  writeFile,
  createItem as apiCreateItem,
  deleteItem as apiDeleteItem,
  renameItem as apiRenameItem,
} from "@/api/files";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileNode {
  /** Display name (basename). */
  name: string;
  /** Full path relative to the workspace root. */
  path: string;
  /** Whether this entry is a file or directory. */
  type: "file" | "directory";
  /** Lazily-loaded children (directories only). */
  children?: FileNode[];
  /** Whether children have been fetched from the server. */
  isLoaded?: boolean;
}

export interface OpenFile {
  /** Full path of the file. */
  path: string;
  /** Basename for tab display. */
  name: string;
  /** Current editor content. */
  content: string;
  /** Monaco language identifier. */
  language: string;
  /** Whether the buffer has unsaved changes. */
  isDirty: boolean;
  /** Content as last read/saved — used for dirty detection. */
  originalContent: string;
}

interface FileState {
  // -- Workspace state --
  workspaceDirs: string[];
  gitBranch: string;
  gitRepo: string;

  // -- File tree --
  fileTree: FileNode[];
  expandedDirs: Set<string>;

  // -- Open files / editor tabs --
  openFiles: OpenFile[];
  activeFilePath: string | null;

  // -- Actions --
  loadWorkspace: () => Promise<void>;
  loadDir: (dirPath: string) => Promise<void>;
  toggleDir: (dirPath: string) => Promise<void>;
  openFile: (filePath: string) => Promise<void>;
  closeFile: (filePath: string) => void;
  setActiveFile: (filePath: string) => void;
  updateFileContent: (filePath: string, content: string) => void;
  saveFile: (filePath: string) => Promise<void>;
  createItem: (
    parentDir: string,
    name: string,
    type: "file" | "directory",
  ) => Promise<void>;
  deleteItem: (itemPath: string) => Promise<void>;
  renameItem: (from: string, to: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a filename extension to a Monaco editor language ID. */
export function getLanguage(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();

  const languageMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".html": "html",
    ".htm": "html",
    ".xml": "xml",
    ".svg": "xml",
    ".md": "markdown",
    ".mdx": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "ini",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".swift": "swift",
    ".rb": "ruby",
    ".php": "php",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".fish": "shell",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".dockerfile": "dockerfile",
    ".lua": "lua",
    ".r": "r",
    ".dart": "dart",
    ".vue": "html",
    ".astro": "html",
  };

  return languageMap[ext] ?? "plaintext";
}

/**
 * Convert a [fullPath, type] tuple from the server into a `FileNode`.
 *
 * The server's `listDir` returns full paths (e.g. `/Users/joe/project/src`),
 * not bare filenames. We extract the basename for display and keep the
 * full path for navigation.
 *
 * Type: 1 = file, 2 = directory.
 */
function entryToNode(
  fullPath: string,
  type: number,
  _parentPath: string,
): FileNode {
  // Extract the basename for display — last segment of the path
  const segments = fullPath.split("/");
  const basename = segments[segments.length - 1] || fullPath;

  return {
    name: basename,
    path: fullPath,
    type: type === 2 ? "directory" : "file",
    children: type === 2 ? [] : undefined,
    isLoaded: type === 2 ? false : undefined,
  };
}

/**
 * Recursively update children of the node at `targetPath` within a tree.
 * Returns a new tree array (immutable).
 */
function updateNodeChildren(
  tree: FileNode[],
  targetPath: string,
  children: FileNode[],
): FileNode[] {
  return tree.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children, isLoaded: true };
    }
    if (node.children && targetPath.startsWith(node.path + "/")) {
      return {
        ...node,
        children: updateNodeChildren(node.children, targetPath, children),
      };
    }
    return node;
  });
}

/**
 * Recursively remove a node at `targetPath` from the tree.
 */
function removeNode(tree: FileNode[], targetPath: string): FileNode[] {
  return tree
    .filter((node) => node.path !== targetPath)
    .map((node) => {
      if (node.children) {
        return { ...node, children: removeNode(node.children, targetPath) };
      }
      return node;
    });
}

/**
 * Sort file nodes: directories first, then alphabetical (case-insensitive).
 */
function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFileStore = create<FileState>((set, get) => ({
  // -- Initial state --
  workspaceDirs: [],
  gitBranch: "",
  gitRepo: "",
  fileTree: [],
  expandedDirs: new Set<string>(),
  openFiles: [],
  activeFilePath: null,

  // -- Load workspace metadata --
  loadWorkspace: async () => {
    try {
      const workspace = await getWorkspace();
      set({
        workspaceDirs: workspace.dirs,
        gitBranch: workspace.branch,
        gitRepo: workspace.repo,
      });
    } catch (err) {
      console.error("[fileStore] Failed to load workspace:", err);
    }
  },

  // -- Load directory contents --
  loadDir: async (dirPath: string) => {
    try {
      const { entries } = await listDir(dirPath);
      const children = sortNodes(
        entries.map(([name, type]) => entryToNode(name, type, dirPath)),
      );

      set((state) => {
        // Check if this is a root-level load (dirPath is a workspace dir)
        const isRoot = state.workspaceDirs.includes(dirPath);
        if (isRoot && state.fileTree.length === 0) {
          return { fileTree: children };
        }
        if (isRoot) {
          // Merge with existing root nodes
          return { fileTree: children };
        }
        return {
          fileTree: updateNodeChildren(state.fileTree, dirPath, children),
        };
      });
    } catch (err) {
      console.error(`[fileStore] Failed to load directory ${dirPath}:`, err);
    }
  },

  // -- Toggle directory expand/collapse --
  toggleDir: async (dirPath: string) => {
    const { expandedDirs } = get();
    const newExpanded = new Set(expandedDirs);

    if (newExpanded.has(dirPath)) {
      newExpanded.delete(dirPath);
      set({ expandedDirs: newExpanded });
    } else {
      newExpanded.add(dirPath);
      set({ expandedDirs: newExpanded });

      // Lazy-load children if not yet fetched
      const findNode = (nodes: FileNode[]): FileNode | undefined => {
        for (const n of nodes) {
          if (n.path === dirPath) return n;
          if (n.children) {
            const found = findNode(n.children);
            if (found) return found;
          }
        }
        return undefined;
      };

      const node = findNode(get().fileTree);
      if (node && !node.isLoaded) {
        await get().loadDir(dirPath);
      }
    }
  },

  // -- Open a file in the editor --
  openFile: async (filePath: string) => {
    const { openFiles } = get();

    // If already open, just activate it
    if (openFiles.some((f) => f.path === filePath)) {
      set({ activeFilePath: filePath });
      return;
    }

    try {
      const { content } = await readFile(filePath);
      const name = filePath.split("/").pop() ?? filePath;
      const language = getLanguage(name);

      set((state) => ({
        openFiles: [
          ...state.openFiles,
          {
            path: filePath,
            name,
            content,
            language,
            isDirty: false,
            originalContent: content,
          },
        ],
        activeFilePath: filePath,
      }));
    } catch (err) {
      console.error(`[fileStore] Failed to open file ${filePath}:`, err);
    }
  },

  // -- Close a file tab --
  closeFile: (filePath: string) => {
    set((state) => {
      const newOpenFiles = state.openFiles.filter((f) => f.path !== filePath);
      let newActive = state.activeFilePath;

      if (state.activeFilePath === filePath) {
        newActive =
          newOpenFiles.length > 0
            ? newOpenFiles[newOpenFiles.length - 1].path
            : null;
      }

      return { openFiles: newOpenFiles, activeFilePath: newActive };
    });
  },

  // -- Set active file --
  setActiveFile: (filePath: string) => {
    set({ activeFilePath: filePath });
  },

  // -- Update file content (from editor onChange) --
  updateFileContent: (filePath: string, content: string) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === filePath
          ? { ...f, content, isDirty: content !== f.originalContent }
          : f,
      ),
    }));
  },

  // -- Save file to server --
  saveFile: async (filePath: string) => {
    const file = get().openFiles.find((f) => f.path === filePath);
    if (!file) return;

    try {
      await writeFile(filePath, file.content);
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.path === filePath
            ? { ...f, isDirty: false, originalContent: f.content }
            : f,
        ),
      }));
    } catch (err) {
      console.error(`[fileStore] Failed to save file ${filePath}:`, err);
    }
  },

  // -- Create file or directory --
  createItem: async (
    parentDir: string,
    name: string,
    type: "file" | "directory",
  ) => {
    const itemPath = parentDir.endsWith("/")
      ? `${parentDir}${name}`
      : `${parentDir}/${name}`;

    try {
      await apiCreateItem(itemPath, type);
      // Refresh the parent directory
      await get().loadDir(parentDir);
    } catch (err) {
      console.error(`[fileStore] Failed to create ${type} ${itemPath}:`, err);
    }
  },

  // -- Delete file or directory --
  deleteItem: async (itemPath: string) => {
    try {
      await apiDeleteItem(itemPath);

      set((state) => ({
        fileTree: removeNode(state.fileTree, itemPath),
        openFiles: state.openFiles.filter(
          (f) => f.path !== itemPath && !f.path.startsWith(itemPath + "/"),
        ),
        activeFilePath:
          state.activeFilePath === itemPath ||
          state.activeFilePath?.startsWith(itemPath + "/")
            ? (state.openFiles.find(
                (f) =>
                  f.path !== itemPath && !f.path.startsWith(itemPath + "/"),
              )?.path ?? null)
            : state.activeFilePath,
      }));
    } catch (err) {
      console.error(`[fileStore] Failed to delete ${itemPath}:`, err);
    }
  },

  // -- Rename file or directory --
  renameItem: async (from: string, to: string) => {
    try {
      await apiRenameItem(from, to);

      // Refresh the parent directory of the original path
      const parentDir = from.substring(0, from.lastIndexOf("/")) || "/";
      await get().loadDir(parentDir);

      // Update any open files whose path starts with the old path
      set((state) => ({
        openFiles: state.openFiles.map((f) => {
          if (f.path === from) {
            const newName = to.split("/").pop() ?? to;
            return {
              ...f,
              path: to,
              name: newName,
              language: getLanguage(newName),
            };
          }
          if (f.path.startsWith(from + "/")) {
            const newPath = to + f.path.substring(from.length);
            const newName = newPath.split("/").pop() ?? newPath;
            return {
              ...f,
              path: newPath,
              name: newName,
              language: getLanguage(newName),
            };
          }
          return f;
        }),
        activeFilePath:
          state.activeFilePath === from
            ? to
            : state.activeFilePath?.startsWith(from + "/")
              ? to + (state.activeFilePath?.substring(from.length) ?? "")
              : state.activeFilePath,
      }));
    } catch (err) {
      console.error(`[fileStore] Failed to rename ${from} → ${to}:`, err);
    }
  },
}));
