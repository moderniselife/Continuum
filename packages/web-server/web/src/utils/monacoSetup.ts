/**
 * monacoSetup — TypeScript language configuration for the Continuum Monaco editor.
 *
 * Configures:
 *  1. TypeScript compiler options (strict, jsx, module resolution, etc.)
 *  2. Semantic + syntactic diagnostics (red squiggles)
 *  3. Auto-type acquisition for imported modules
 *  4. File model registration so cross-file references resolve
 *
 * @module utils/monacoSetup
 */

import type { Monaco } from "@monaco-editor/react";
import { getTsconfig } from "@/api/files";

/** Configures TypeScript and JavaScript language defaults for Monaco. */
export function configureTypeScript(monaco: Monaco): void {
  const tsDefaults = monaco.languages.typescript.typescriptDefaults;
  const jsDefaults = monaco.languages.typescript.javascriptDefaults;

  // ─── Compiler Options ──────────────────────────────────────────
  const ts = monaco.languages.typescript;
  const compilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    allowNonTsExtensions: true,
    strict: true,
    noEmit: true,
    isolatedModules: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    // Path aliases — will be overridden by loadProjectTsconfig
    baseUrl: ".",
    paths: {} as Record<string, string[]>,
  };

  tsDefaults.setCompilerOptions(compilerOptions);
  jsDefaults.setCompilerOptions(compilerOptions);

  // ─── Diagnostics ───────────────────────────────────────────────
  tsDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  });

  jsDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  });

  // ─── Eagerness ─────────────────────────────────────────────────
  tsDefaults.setEagerModelSync(true);
  jsDefaults.setEagerModelSync(true);

  // ─── IntelliSense ──────────────────────────────────────────────
  tsDefaults.setWorkerOptions({
    customWorkerPath: undefined,
  });

  console.info("[monacoSetup] TypeScript language defaults configured");
}

/** Track whether we've already loaded the project tsconfig. */
let projectTsconfigLoaded = false;

/**
 * Loads the project's tsconfig.json from the backend and applies its
 * compiler options (paths, baseUrl, strict settings, etc.) to Monaco's
 * TypeScript language service.
 *
 * This should be called once after the first file is opened.
 */
export async function loadProjectTsconfig(
  monaco: Monaco,
  filePath?: string,
): Promise<void> {
  if (projectTsconfigLoaded) return;

  try {
    const tsconfig = await getTsconfig(filePath);
    if (!tsconfig.found) {
      console.info("[monacoSetup] No tsconfig found for project");
      return;
    }

    const opts = tsconfig.compilerOptions;
    const tsDefaults = monaco.languages.typescript.typescriptDefaults;
    const jsDefaults = monaco.languages.typescript.javascriptDefaults;
    const ts = monaco.languages.typescript;

    // Map string values to Monaco enums where needed
    const targetMap: Record<string, number> = {
      es5: ts.ScriptTarget.ES5,
      es6: ts.ScriptTarget.ES2015,
      es2015: ts.ScriptTarget.ES2015,
      es2016: ts.ScriptTarget.ES2016,
      es2017: ts.ScriptTarget.ES2017,
      es2018: ts.ScriptTarget.ES2018,
      es2019: ts.ScriptTarget.ES2019,
      es2020: ts.ScriptTarget.ES2020,
      esnext: ts.ScriptTarget.ESNext,
    };

    const moduleMap: Record<string, number> = {
      commonjs: ts.ModuleKind.CommonJS,
      amd: ts.ModuleKind.AMD,
      es2015: ts.ModuleKind.ES2015,
      esnext: ts.ModuleKind.ESNext,
      nodenext: ts.ModuleKind.ESNext,
    };

    const jsxMap: Record<string, number> = {
      react: ts.JsxEmit.React,
      "react-jsx": ts.JsxEmit.ReactJSX,
      "react-jsxdev": ts.JsxEmit.ReactJSX,
      "react-native": ts.JsxEmit.ReactNative,
      preserve: ts.JsxEmit.Preserve,
    };

    const moduleResMap: Record<string, number> = {
      node: ts.ModuleResolutionKind.NodeJs,
      node16: ts.ModuleResolutionKind.NodeJs,
      nodenext: ts.ModuleResolutionKind.NodeJs,
      classic: ts.ModuleResolutionKind.Classic,
      bundler: ts.ModuleResolutionKind.NodeJs, // closest approximation
    };

    const targetStr = String(opts.target ?? "esnext").toLowerCase();
    const moduleStr = String(opts.module ?? "esnext").toLowerCase();
    const jsxStr = String(opts.jsx ?? "react-jsx").toLowerCase();
    const moduleResStr = String(opts.moduleResolution ?? "node").toLowerCase();

    // Resolve baseUrl to an absolute file:// URI relative to tsconfig dir.
    // Monaco's TS worker can't resolve relative baseUrl values like "."
    // because it has no concept of the project's filesystem location.
    const tsconfigDir = tsconfig.path
      ? tsconfig.path.replace(/\/[^/]+$/, "")
      : "";
    const rawBaseUrl = (opts.baseUrl as string) ?? ".";
    const rawPaths = (opts.paths as Record<string, string[]>) ?? {};

    // Compute absolute baseUrl: resolve rawBaseUrl against tsconfig dir
    // e.g. tsconfigDir="/Users/.../apps/web", baseUrl="." → "/Users/.../apps/web"
    let absoluteBaseUrl: string;
    if (rawBaseUrl.startsWith("/")) {
      absoluteBaseUrl = rawBaseUrl;
    } else {
      // Resolve relative baseUrl against tsconfig directory
      absoluteBaseUrl = `${tsconfigDir}/${rawBaseUrl}`.replace(
        /\/\.(?=\/|$)/g,
        "",
      );
    }

    // Convert paths values to absolute file:// URIs
    // e.g. "@/*": ["./src/*"] → "@/*": ["file:///Users/.../apps/web/src/*"]
    const resolvedPaths: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(rawPaths)) {
      resolvedPaths[key] = values.map((v) => {
        if (v.startsWith("/")) return `file://${v}`;
        // Resolve relative to absoluteBaseUrl
        const resolved = `${absoluteBaseUrl}/${v}`.replace(/\/\.(?=\/|$)/g, "");
        return `file://${resolved}`;
      });
    }

    const compilerOptions = {
      target: targetMap[targetStr] ?? ts.ScriptTarget.ESNext,
      module: moduleMap[moduleStr] ?? ts.ModuleKind.ESNext,
      moduleResolution:
        moduleResMap[moduleResStr] ?? ts.ModuleResolutionKind.NodeJs,
      jsx: jsxMap[jsxStr] ?? ts.JsxEmit.ReactJSX,
      esModuleInterop: (opts.esModuleInterop as boolean) ?? true,
      allowSyntheticDefaultImports:
        (opts.allowSyntheticDefaultImports as boolean) ?? true,
      allowNonTsExtensions: true,
      strict: (opts.strict as boolean) ?? true,
      noEmit: true,
      isolatedModules: true,
      resolveJsonModule: (opts.resolveJsonModule as boolean) ?? true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      baseUrl: `file://${absoluteBaseUrl}`,
      paths: resolvedPaths,
    };

    tsDefaults.setCompilerOptions(compilerOptions);
    jsDefaults.setCompilerOptions(compilerOptions);

    projectTsconfigLoaded = true;

    const pathCount = Object.keys(compilerOptions.paths).length;
    console.info(
      `[monacoSetup] Loaded project tsconfig from ${tsconfig.path}` +
        ` (baseUrl: ${compilerOptions.baseUrl}, ${pathCount} path aliases)`,
    );
  } catch (err) {
    console.warn("[monacoSetup] Failed to load project tsconfig:", err);
  }
}

/**
 * Registers a file's content with Monaco's TypeScript language service
 * so that imports and cross-file references resolve correctly.
 *
 * Each file is registered as an "extra lib" keyed by a `file:///` URI.
 * Returns a dispose function to remove the registration.
 */
export function registerFileContent(
  monaco: Monaco,
  filePath: string,
  content: string,
): import("monaco-editor").IDisposable | undefined {
  const uri = pathToModelUri(filePath);

  // Check if a model already exists for this URI
  const existing = monaco.editor.getModel(monaco.Uri.parse(uri));

  if (existing) {
    // Update existing model content if it changed
    const currentValue = existing.getValue();
    if (currentValue !== content) {
      existing.setValue(content);
    }
    return undefined;
  }

  // Register as an extra lib so the TS language service sees it
  return monaco.languages.typescript.typescriptDefaults.addExtraLib(
    content,
    uri,
  );
}

/**
 * Bulk-register type declarations (e.g. `.d.ts` files) with Monaco.
 * Used for loading type packages so IntelliSense works for node_modules.
 */
export function registerTypeDeclarations(
  monaco: Monaco,
  declarations: Array<{ path: string; content: string }>,
): import("monaco-editor").IDisposable[] {
  const disposables: import("monaco-editor").IDisposable[] = [];

  for (const { path, content } of declarations) {
    const uri = `file://${path}`;
    const existing = monaco.editor.getModel(monaco.Uri.parse(uri));
    if (!existing) {
      const disposable =
        monaco.languages.typescript.typescriptDefaults.addExtraLib(
          content,
          uri,
        );
      disposables.push(disposable);
    }
  }

  return disposables;
}

/**
 * Creates or returns an existing Monaco editor model for a file path.
 * Using models (instead of just value/language props) enables cross-file
 * reference resolution and preserves undo history per file.
 */
export function getOrCreateModel(
  monaco: Monaco,
  filePath: string,
  content: string,
  language: string,
): import("monaco-editor").editor.ITextModel {
  const uri = monaco.Uri.parse(pathToModelUri(filePath));
  const existing = monaco.editor.getModel(uri);

  if (existing) {
    // Only update if content actually changed (preserves undo stack)
    if (existing.getValue() !== content) {
      existing.setValue(content);
    }
    return existing;
  }

  return monaco.editor.createModel(content, language, uri);
}

/**
 * Converts a file system path to a `file:///` URI suitable for Monaco.
 */
export function pathToModelUri(filePath: string): string {
  // Normalise to forward slashes and ensure file:// prefix
  const normalised = filePath.replace(/\\/g, "/");
  if (normalised.startsWith("file://")) return normalised;
  return `file://${normalised.startsWith("/") ? "" : "/"}${normalised}`;
}

/**
 * Extract import paths from TypeScript/JavaScript source code.
 * Returns an array of module specifiers (e.g. "react", "./utils", "../types").
 */
export function extractImports(source: string): string[] {
  const imports: string[] = [];

  // Static imports: import ... from "..."
  const staticImportRe = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = staticImportRe.exec(source)) !== null) {
    imports.push(match[1]);
  }

  // Dynamic imports: import("...")
  const dynamicImportRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRe.exec(source)) !== null) {
    imports.push(match[1]);
  }

  // require("...")
  const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRe.exec(source)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)];
}

/**
 * Determines if an import specifier is a relative path (starts with . or /).
 */
export function isRelativeImport(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/")
  );
}

/**
 * Gets the package name from an import specifier.
 * Handles scoped packages (e.g. "@types/react" → "@types/react").
 */
export function getPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    // Scoped package: take first two segments
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  // Regular package: take first segment
  return specifier.split("/")[0];
}

/**
 * Extracts the import specifier string at a given position in the model.
 * Looks for import/require statements and extracts the module path string.
 */
function getImportSpecifierAtPosition(
  model: import("monaco-editor").editor.ITextModel,
  position: import("monaco-editor").Position,
): string | null {
  const line = model.getLineContent(position.lineNumber);

  // Match: import ... from "specifier" or import "specifier"
  // Also: require("specifier"), import("specifier")
  const patterns = [
    /from\s+['"]([^'"]+)['"]/,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    /import\s+['"]([^'"]+)['"]/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const specifier = match[1];
      // Check if the cursor is within or near the specifier string
      const specStart = line.indexOf(specifier);
      const specEnd = specStart + specifier.length;
      // Allow some slack — anywhere on the import line counts
      if (position.column >= 1) {
        return specifier;
      }
    }
  }

  return null;
}

/** Disposable handle — stored so we don't register multiple openers. */
let editorOpenerDisposable: import("monaco-editor").IDisposable | null = null;

/**
 * Registers a Monaco EditorOpener that intercepts "Go to Definition" and
 * similar cross-file navigation requests.
 *
 * In standalone Monaco (not full VS Code), the editor doesn't know how to
 * open a different file when a definition is in another URI. The built-in
 * TypeScript language service already resolves definitions correctly (which
 * is why "Show References" works), but Cmd+Click fails silently because
 * there's no opener registered.
 *
 * This function registers an opener that:
 *  1. Extracts the file path from the target URI
 *  2. Opens the file in our editor via fileStore.openFile()
 *  3. Scrolls to the target line once the model is loaded
 */
export function registerEditorOpener(
  monaco: Monaco,
  openFileFn: (filePath: string) => Promise<void>,
): void {
  // Only register once
  if (editorOpenerDisposable) return;

  editorOpenerDisposable = monaco.editor.registerEditorOpener({
    openCodeEditor(source, resource, selectionOrPosition) {
      // Extract the file path from the URI
      const targetPath = resource.path;

      if (!targetPath || targetPath === source.getModel()?.uri.path) {
        // Same file — let Monaco handle it internally
        return false;
      }

      // Open the file in our editor tabs
      void openFileFn(targetPath).then(() => {
        // After the file opens, try to scroll to the target line
        if (selectionOrPosition) {
          // Give Monaco a tick to switch models
          requestAnimationFrame(() => {
            const editors = monaco.editor.getEditors();
            const activeEditor =
              editors.find((e) => e.getModel()?.uri.path === targetPath) ??
              editors[0];

            if (activeEditor && selectionOrPosition) {
              const sel = selectionOrPosition as import("monaco-editor").IRange;
              const line = sel.startLineNumber ?? 1;
              activeEditor.revealLineInCenter(line);
              activeEditor.setPosition({
                lineNumber: line,
                column: sel.startColumn ?? 1,
              });
              activeEditor.focus();
            }
          });
        }
      });

      // Return true = we handled the open request
      return true;
    },
  });

  console.info(
    "[monacoSetup] EditorOpener registered for Cmd+Click / Go to Definition navigation",
  );
}
