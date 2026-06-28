/**
 * EditorPanel — Main code editor area for the Continuum Web IDE.
 *
 * Features:
 *  • Monaco Editor with full TypeScript/JavaScript IntelliSense
 *  • Semantic + syntactic linting (red squiggles)
 *  • Auto-loaded type declarations for imported packages
 *  • Per-file models with independent undo history
 *  • ⌘S / Ctrl+S — Save the active file
 *  • Empty state with keyboard shortcut hints
 *
 * @module components/editor/EditorPanel
 */

import { useEffect, useCallback, useRef } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { FileCode2, Search, Save } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { EditorTabs } from "@/components/editor/EditorTabs";
import {
  configureTypeScript,
  loadProjectTsconfig,
  getOrCreateModel,
  extractImports,
  isRelativeImport,
  getPackageName,
  registerTypeDeclarations,
} from "@/utils/monacoSetup";
import { resolveTypes, resolveImports } from "@/api/files";

/** Tracks which packages have already had their types loaded. */
const loadedPackages = new Set<string>();

export function EditorPanel() {
  const { openFiles, activeFilePath, updateFileContent, saveFile } =
    useFileStore();

  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? null;
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  // ⌘S / Ctrl+S to save the active file
  const handleSave = useCallback(() => {
    if (activeFilePath) {
      saveFile(activeFilePath);
    }
  }, [activeFilePath, saveFile]);

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

  // Configure TypeScript defaults once when Monaco loads
  const handleBeforeMount = useCallback((monaco: Monaco) => {
    monacoRef.current = monaco;
    configureTypeScript(monaco);
  }, []);

  // When the editor mounts, grab the reference
  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  }, []);

  // Whenever the active file changes, set the correct model and load types
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor || !activeFile) return;

    // Create or get the model for this file
    const model = getOrCreateModel(
      monaco,
      activeFile.path,
      activeFile.content,
      activeFile.language,
    );

    // Only switch model if it's different from current
    if (editor.getModel() !== model) {
      editor.setModel(model);
    }

    // Also register all other open files as extra libs for cross-file refs
    for (const file of openFiles) {
      if (file.path !== activeFile.path) {
        getOrCreateModel(monaco, file.path, file.content, file.language);
      }
    }

    // Load project tsconfig on first file open (async, non-blocking)
    loadProjectTsconfig(monaco, activeFile.path);

    // Auto-load type declarations for imported packages
    loadTypesForFile(monaco, activeFile.content);

    // Auto-resolve and register relative/alias imports for cross-file IntelliSense
    loadRelativeImports(monaco, activeFile.path, activeFile.content);
  }, [activeFilePath, activeFile?.path]);

  // Empty state — no files open
  if (!activeFile) {
    return (
      <div className="bg-bg-base flex h-full flex-1 flex-col items-center justify-center">
        <div className="glass-subtle glass-shine animate-fade-in flex max-w-xs flex-col items-center gap-5 rounded-2xl px-8 py-10 text-center">
          <div className="bg-accent-muted flex h-14 w-14 items-center justify-center rounded-xl">
            <FileCode2 size={28} className="text-accent" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-text-primary text-base font-semibold">
              Open a file to start editing
            </h3>
            <p className="text-text-tertiary text-xs">
              Browse the file explorer or use a keyboard shortcut below
            </p>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <ShortcutHint icon={Search} label="Quick Open" shortcut="⌘P" />
            <ShortcutHint icon={Save} label="Save" shortcut="⌘S" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-base flex h-full flex-1 flex-col">
      {/* Tab bar */}
      <EditorTabs />

      {/* Monaco Editor */}
      <div className="monaco-container flex-1">
        <Editor
          height="100%"
          language={activeFile.language}
          defaultValue={activeFile.content}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          onChange={(value) => {
            if (activeFile.path) {
              updateFileContent(activeFile.path, value ?? "");
            }
          }}
          theme="vs-dark"
          path={activeFile.path}
          options={{
            minimap: { enabled: true },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
            lineNumbers: "on",
            bracketPairColorization: { enabled: true },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            tabSize: 2,
            wordWrap: "off",
            scrollBeyondLastLine: true,
            renderLineHighlight: "all",
            roundedSelection: true,
            // IntelliSense options
            suggestOnTriggerCharacters: true,
            quickSuggestions: {
              other: true,
              comments: false,
              strings: true,
            },
            parameterHints: { enabled: true },
            formatOnPaste: true,
            formatOnType: true,
            inlayHints: { enabled: "on" },
            linkedEditing: true,
            hover: { enabled: true, delay: 300 },
          }}
        />
      </div>
    </div>
  );
}

/* ── Auto-resolve relative/alias imports ─────────────────────── */

/** Tracks which source files have already had their imports resolved. */
const resolvedImportSources = new Set<string>();

/**
 * Resolves relative and path-alias imports from a file, fetches their
 * content from the backend, and registers them as extra libs in Monaco
 * so that cross-file references and IntelliSense work correctly.
 */
async function loadRelativeImports(
  monaco: Monaco,
  filePath: string,
  content: string,
): Promise<void> {
  if (resolvedImportSources.has(filePath)) return;
  resolvedImportSources.add(filePath);

  try {
    const allImports = extractImports(content);
    // Include both relative imports and path-alias imports (@/, ~/)
    const resolvableImports = allImports.filter(
      (imp) =>
        imp.startsWith("./") ||
        imp.startsWith("../") ||
        imp.startsWith("@/") ||
        imp.startsWith("~/"),
    );

    if (resolvableImports.length === 0) return;

    const { resolved } = await resolveImports(filePath, resolvableImports);

    for (const { path: resolvedPath, content: fileContent } of resolved) {
      // Register as a model so Monaco's TS worker can resolve references
      const lang =
        resolvedPath.endsWith(".tsx") || resolvedPath.endsWith(".jsx")
          ? "typescriptreact"
          : resolvedPath.endsWith(".ts")
            ? "typescript"
            : "javascript";
      getOrCreateModel(monaco, resolvedPath, fileContent, lang);
    }

    if (resolved.length > 0) {
      console.info(
        `[EditorPanel] Auto-registered ${resolved.length} imported files for ${filePath.split("/").pop()}`,
      );
    }
  } catch (err) {
    console.warn("[EditorPanel] Failed to auto-resolve imports:", err);
  }
}

/* ── Auto-load types for imports ─────────────────────────────── */

/**
 * Scans the file content for imports and lazily loads type declarations
 * from the backend for any unloaded npm packages.
 */
async function loadTypesForFile(
  monaco: Monaco,
  content: string,
): Promise<void> {
  try {
    const imports = extractImports(content);
    const npmImports = imports.filter((imp) => !isRelativeImport(imp));
    const packages = [...new Set(npmImports.map(getPackageName))];

    // Only load packages we haven't loaded yet
    const unloaded = packages.filter((pkg) => !loadedPackages.has(pkg));
    if (unloaded.length === 0) return;

    // Mark them as loading to prevent duplicate requests
    for (const pkg of unloaded) {
      loadedPackages.add(pkg);
    }

    const { results } = await resolveTypes(
      unloaded.map((pkg) => pkg), // Send package names as import specifiers
    );

    for (const [_pkg, declarations] of Object.entries(results)) {
      registerTypeDeclarations(monaco, declarations);
    }

    console.info(
      `[EditorPanel] Loaded types for: ${Object.keys(results).join(", ") || "none"}`,
    );
  } catch (err) {
    console.warn("[EditorPanel] Failed to auto-load types:", err);
  }
}

/* ── Helper: Shortcut hint row ───────────────────────────────── */

function ShortcutHint({
  icon: Icon,
  label,
  shortcut,
}: {
  icon: typeof Search;
  label: string;
  shortcut: string;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <Icon size={13} className="text-text-tertiary" />
      <span className="text-text-secondary">{label}</span>
      <kbd className="bg-bg-elevated text-text-tertiary ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">
        {shortcut}
      </kbd>
    </div>
  );
}

export default EditorPanel;
