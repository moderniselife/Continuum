import { Router, type Request, type Response } from "express";
import { WebIDE } from "../ide/WebIDE.js";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

/**
 * Sensitive file extensions and patterns that should be blocked from
 * read/write access via the HTTP API.
 */
const BLOCKED_EXTENSIONS = new Set([
  ".env",
  ".pem",
  ".key",
  ".crt",
  ".jks",
  ".p12",
  ".pfx",
  ".ppk",
  ".gpg",
  ".secret",
  ".secrets",
  ".token",
]);

/**
 * Checks whether a file path matches a security-sensitive pattern.
 *
 * This is a lightweight local check used as a safety net. It blocks
 * common secret/key file extensions and `.env*` variants.
 *
 * @param filePath - The absolute or relative file path to check.
 * @returns `true` if the file is considered a security concern.
 */
function isSecurityConcernLocal(filePath: string): boolean {
  const basename = path.basename(filePath);
  const ext = path.extname(basename).toLowerCase();

  // Block known sensitive extensions
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return true;
  }

  // Block .env files (including .env.local, .env.production, etc.)
  if (basename === ".env" || basename.startsWith(".env.")) {
    return true;
  }

  // Block SSH key patterns
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(basename)) {
    return true;
  }

  return false;
}

/**
 * Validates that a given path is within one of the allowed workspace
 * directories. Returns the resolved absolute path, or `null` if the
 * path is outside the workspace or matches a security concern.
 *
 * @param rawPath - The raw path string from the request.
 * @param workspaceDirs - Array of allowed workspace root directories.
 * @returns The resolved path, or `null` if validation fails.
 */
function validatePath(
  rawPath: string,
  workspaceDirs: string[],
): { resolved: string } | { error: string; status: number } {
  if (!rawPath) {
    return { error: "Path parameter is required", status: 400 };
  }

  const resolved = path.resolve(rawPath);

  // Check path containment — must be within at least one workspace directory
  const isWithinWorkspace = workspaceDirs.some((dir) => {
    const resolvedDir = path.resolve(dir);
    return (
      resolved === resolvedDir || resolved.startsWith(resolvedDir + path.sep)
    );
  });

  if (!isWithinWorkspace) {
    return {
      error: "Access denied: path is outside the workspace",
      status: 403,
    };
  }

  // Check for security-sensitive files
  if (isSecurityConcernLocal(resolved)) {
    return {
      error: "Access denied: file is a security concern",
      status: 403,
    };
  }

  return { resolved };
}

/**
 * Creates Express router routes for file system operations within
 * the Continuum Web IDE.
 *
 * All file operations are restricted to workspace directories and
 * security-sensitive files are blocked.
 *
 * @param webIde - The shared WebIDE instance for filesystem access.
 * @returns An Express Router with file, workspace, and git endpoints.
 */
export function createFileRoutes(webIde: WebIDE): Router {
  const router = Router();

  // Cache workspace dirs for path validation
  let cachedWorkspaceDirs: string[] = [];

  /**
   * Resolves and caches workspace directories from the WebIDE instance.
   */
  async function getWorkspaceDirs(): Promise<string[]> {
    if (cachedWorkspaceDirs.length === 0) {
      cachedWorkspaceDirs = await webIde.getWorkspaceDirs();
    }
    return cachedWorkspaceDirs;
  }

  /**
   * Helper to validate a path from a request parameter against
   * the workspace directories. Sends an error response if invalid.
   *
   * @returns The resolved path, or `null` if validation failed (response already sent).
   */
  async function validateRequestPath(
    rawPath: string | undefined,
    res: Response,
  ): Promise<string | null> {
    if (!rawPath) {
      res.status(400).json({ error: "Path parameter is required" });
      return null;
    }

    const dirs = await getWorkspaceDirs();
    const result = validatePath(rawPath, dirs);

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return null;
    }

    return result.resolved;
  }

  // ============================================================
  // Workspace Information
  // ============================================================

  /**
   * GET /workspace
   * Returns workspace directories, current git branch, and repository name.
   */
  router.get("/workspace", async (_req: Request, res: Response) => {
    try {
      const dirs = await webIde.getWorkspaceDirs();
      const branch = dirs.length > 0 ? await webIde.getBranch(dirs[0]) : "main";
      const repo =
        dirs.length > 0 ? await webIde.getRepoName(dirs[0]) : undefined;

      res.json({ dirs, branch, repo });
    } catch (error) {
      res.status(500).json({
        error: "Failed to retrieve workspace information",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // File Operations
  // ============================================================

  /**
   * GET /files/list
   * Lists directory contents. Returns an array of [name, type] tuples
   * where type is 1 for files and 2 for directories.
   */
  router.get("/files/list", async (req: Request, res: Response) => {
    try {
      const dirPath = req.query.path as string | undefined;
      const resolved = await validateRequestPath(dirPath, res);
      if (resolved === null) return;

      const entries = await webIde.listDir(resolved);
      res.json({ entries, path: resolved });
    } catch (error) {
      res.status(500).json({
        error: "Failed to list directory",
        details: (error as Error).message,
      });
    }
  });

  /**
   * GET /files/read
   * Reads the contents of a file.
   */
  router.get("/files/read", async (req: Request, res: Response) => {
    try {
      const filePath = req.query.path as string | undefined;
      const resolved = await validateRequestPath(filePath, res);
      if (resolved === null) return;

      if (!fs.existsSync(resolved)) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        res.status(400).json({ error: "Path is a directory, not a file" });
        return;
      }

      const content = await webIde.readFile(resolved);
      res.json({ content, path: resolved });
    } catch (error) {
      res.status(500).json({
        error: "Failed to read file",
        details: (error as Error).message,
      });
    }
  });

  /**
   * PUT /files/write
   * Writes content to a file. Creates parent directories if needed.
   */
  router.put("/files/write", async (req: Request, res: Response) => {
    try {
      const { path: filePath, contents } = req.body as {
        path?: string;
        contents?: string;
      };

      if (typeof contents !== "string") {
        res.status(400).json({ error: "Contents must be a string" });
        return;
      }

      const resolved = await validateRequestPath(filePath, res);
      if (resolved === null) return;

      await webIde.writeFile(resolved, contents);
      res.json({ written: true, path: resolved });
    } catch (error) {
      res.status(500).json({
        error: "Failed to write file",
        details: (error as Error).message,
      });
    }
  });

  /**
   * POST /files/create
   * Creates a new file or directory. For files, creates an empty file.
   * For directories, creates recursively.
   */
  router.post("/files/create", async (req: Request, res: Response) => {
    try {
      const { path: targetPath, type } = req.body as {
        path?: string;
        type?: "file" | "directory";
      };

      if (!type || !["file", "directory"].includes(type)) {
        res.status(400).json({ error: "Type must be 'file' or 'directory'" });
        return;
      }

      const resolved = await validateRequestPath(targetPath, res);
      if (resolved === null) return;

      if (fs.existsSync(resolved)) {
        res.status(409).json({ error: "Path already exists" });
        return;
      }

      if (type === "directory") {
        fs.mkdirSync(resolved, { recursive: true });
      } else {
        // Ensure parent directory exists
        const parentDir = path.dirname(resolved);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        await webIde.writeFile(resolved, "");
      }

      res.status(201).json({ created: true, path: resolved, type });
    } catch (error) {
      res.status(500).json({
        error: "Failed to create path",
        details: (error as Error).message,
      });
    }
  });

  /**
   * DELETE /files/delete
   * Deletes a file or directory (recursively for directories).
   */
  router.delete("/files/delete", async (req: Request, res: Response) => {
    try {
      const filePath = req.query.path as string | undefined;
      const resolved = await validateRequestPath(filePath, res);
      if (resolved === null) return;

      if (!fs.existsSync(resolved)) {
        res.status(404).json({ error: "Path not found" });
        return;
      }

      fs.rmSync(resolved, { recursive: true, force: true });
      res.json({ deleted: true, path: resolved });
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete path",
        details: (error as Error).message,
      });
    }
  });

  /**
   * PATCH /files/rename
   * Renames or moves a file/directory. Both `from` and `to` paths
   * must be within the workspace.
   */
  router.patch("/files/rename", async (req: Request, res: Response) => {
    try {
      const { from, to } = req.body as { from?: string; to?: string };

      const resolvedFrom = await validateRequestPath(from, res);
      if (resolvedFrom === null) return;

      const resolvedTo = await validateRequestPath(to, res);
      if (resolvedTo === null) return;

      if (!fs.existsSync(resolvedFrom)) {
        res.status(404).json({ error: "Source path not found" });
        return;
      }

      if (fs.existsSync(resolvedTo)) {
        res.status(409).json({ error: "Destination path already exists" });
        return;
      }

      // Ensure parent directory of destination exists
      const parentDir = path.dirname(resolvedTo);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.renameSync(resolvedFrom, resolvedTo);
      res.json({ renamed: true, from: resolvedFrom, to: resolvedTo });
    } catch (error) {
      res.status(500).json({
        error: "Failed to rename path",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // Search
  // ============================================================

  /**
   * GET /files/search
   * Searches for text content across workspace files using grep.
   */
  router.get("/files/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.query as string | undefined;
      const maxResults = parseInt((req.query.maxResults as string) ?? "50", 10);

      if (!query) {
        res.status(400).json({ error: "Query parameter is required" });
        return;
      }

      const results = await webIde.getSearchResults(query, maxResults);
      res.json({ results, query });
    } catch (error) {
      res.status(500).json({
        error: "Failed to search files",
        details: (error as Error).message,
      });
    }
  });

  /**
   * GET /files/find
   * Finds files matching a glob pattern in the workspace.
   */
  router.get("/files/find", async (req: Request, res: Response) => {
    try {
      const pattern = req.query.pattern as string | undefined;

      if (!pattern) {
        res.status(400).json({ error: "Pattern parameter is required" });
        return;
      }

      const results = await webIde.getFileResults(pattern);
      res.json({ results, pattern });
    } catch (error) {
      res.status(500).json({
        error: "Failed to find files",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // Git Operations
  // ============================================================

  /**
   * GET /git/status
   * Returns the porcelain git status output for the first workspace directory.
   */
  router.get("/git/status", async (_req: Request, res: Response) => {
    try {
      const dirs = await getWorkspaceDirs();
      if (dirs.length === 0) {
        res.status(400).json({ error: "No workspace directories configured" });
        return;
      }

      const status = execSync("git status --porcelain", {
        cwd: dirs[0],
        encoding: "utf-8",
        timeout: 10_000,
      });

      // Parse porcelain output into structured data
      const files = status
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => ({
          status: line.substring(0, 2).trim(),
          path: line.substring(3),
        }));

      res.json({ files, raw: status });
    } catch (error) {
      res.status(500).json({
        error: "Failed to get git status",
        details: (error as Error).message,
      });
    }
  });

  /**
   * GET /git/branch
   * Returns the current git branch name.
   */
  router.get("/git/branch", async (_req: Request, res: Response) => {
    try {
      const dirs = await getWorkspaceDirs();
      if (dirs.length === 0) {
        res.status(400).json({ error: "No workspace directories configured" });
        return;
      }

      const branch = await webIde.getBranch(dirs[0]);
      res.json({ branch });
    } catch (error) {
      res.status(500).json({
        error: "Failed to get git branch",
        details: (error as Error).message,
      });
    }
  });

  /**
   * GET /git/diff
   * Returns the git diff. Pass `?includeUnstaged=true` to include unstaged changes.
   */
  router.get("/git/diff", async (req: Request, res: Response) => {
    try {
      const includeUnstaged = req.query.includeUnstaged === "true";
      const diff = await webIde.getDiff(includeUnstaged);
      res.json({ diff, includeUnstaged });
    } catch (error) {
      res.status(500).json({
        error: "Failed to get git diff",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // TypeScript / IntelliSense Support
  // ============================================================

  /**
   * GET /tsconfig
   * Finds and returns the nearest tsconfig.json for a given file path,
   * walking up the directory tree from the file's location.
   */
  router.get("/tsconfig", async (req: Request, res: Response) => {
    try {
      const filePath = (req.query.path as string) || "";
      const dirs = await getWorkspaceDirs();
      let searchDir = filePath
        ? path.dirname(path.resolve(filePath))
        : dirs[0] || process.cwd();

      // Walk up from the file until we find a tsconfig.json or hit workspace root
      const workspaceRoot = dirs[0] || "/";
      let tsconfig: Record<string, unknown> | null = null;
      let tsconfigPath = "";

      while (searchDir.length >= workspaceRoot.length) {
        const candidate = path.join(searchDir, "tsconfig.json");
        if (fs.existsSync(candidate)) {
          try {
            const raw = fs.readFileSync(candidate, "utf-8");
            // Strip JSON comments (// and /* */) before parsing
            const stripped = raw
              .replace(/\/\/.*$/gm, "")
              .replace(/\/\*[\s\S]*?\*\//g, "");
            tsconfig = JSON.parse(stripped);
            tsconfigPath = candidate;
          } catch {
            // Malformed tsconfig — keep searching upwards
          }
          break;
        }
        const parent = path.dirname(searchDir);
        if (parent === searchDir) break;
        searchDir = parent;
      }

      res.json({
        found: tsconfig !== null,
        path: tsconfigPath,
        compilerOptions: tsconfig?.compilerOptions ?? {},
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to locate tsconfig",
        details: (error as Error).message,
      });
    }
  });

  /**
   * GET /types/package
   * Returns the main `.d.ts` declaration file for a given npm package.
   * Searches the workspace's node_modules for the package's type definitions.
   *
   * Query: ?name=react&dir=/path/to/workspace
   */
  router.get("/types/package", async (req: Request, res: Response) => {
    try {
      const packageName = req.query.name as string;
      const baseDir =
        (req.query.dir as string) || (await getWorkspaceDirs())[0];

      if (!packageName) {
        res.status(400).json({ error: "Package name is required" });
        return;
      }

      const declarations: Array<{ path: string; content: string }> = [];

      // Strategy 1: Check @types/<package>
      const atTypesDir = path.join(
        baseDir,
        "node_modules",
        "@types",
        packageName.replace(/^@/, "").replace(/\//, "__"),
      );
      if (fs.existsSync(atTypesDir)) {
        collectDeclarationFiles(atTypesDir, declarations, 5);
      }

      // Strategy 2: Check package's own types (package.json "types" or "typings" field)
      const pkgDir = path.join(baseDir, "node_modules", packageName);
      const pkgJsonPath = path.join(pkgDir, "package.json");
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
          const typesEntry =
            pkgJson.types ||
            pkgJson.typings ||
            pkgJson.main?.replace(/\.js$/, ".d.ts");
          if (typesEntry) {
            const typesPath = path.join(pkgDir, typesEntry);
            if (fs.existsSync(typesPath)) {
              declarations.push({
                path: typesPath,
                content: fs.readFileSync(typesPath, "utf-8"),
              });
            }
          }
        } catch {
          // Ignore malformed package.json
        }
      }

      // Strategy 3: Look for index.d.ts in the package root
      const indexDts = path.join(pkgDir, "index.d.ts");
      if (
        fs.existsSync(indexDts) &&
        !declarations.some((d) => d.path === indexDts)
      ) {
        declarations.push({
          path: indexDts,
          content: fs.readFileSync(indexDts, "utf-8"),
        });
      }

      res.json({
        package: packageName,
        found: declarations.length > 0,
        declarations,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to load type declarations",
        details: (error as Error).message,
      });
    }
  });

  /**
   * POST /types/resolve
   * Given a list of import specifiers, resolves and returns type declarations
   * for each. Used by the editor to batch-load types for a file's imports.
   *
   * Body: { imports: string[], dir?: string }
   */
  router.post("/types/resolve", async (req: Request, res: Response) => {
    try {
      const { imports, dir } = req.body as {
        imports: string[];
        dir?: string;
      };
      const baseDir = dir || (await getWorkspaceDirs())[0];
      const results: Record<
        string,
        Array<{ path: string; content: string }>
      > = {};

      for (const specifier of imports ?? []) {
        // Skip relative imports — those are handled by model registration
        if (
          specifier.startsWith("./") ||
          specifier.startsWith("../") ||
          specifier.startsWith("/")
        ) {
          continue;
        }

        // Extract package name from specifier (e.g. "react/jsx-runtime" → "react")
        const pkgName = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0];

        if (results[pkgName]) continue; // Already resolved

        const declarations: Array<{ path: string; content: string }> = [];

        // Check @types
        const atTypesDir = path.join(
          baseDir,
          "node_modules",
          "@types",
          pkgName.replace(/^@/, "").replace(/\//, "__"),
        );
        if (fs.existsSync(atTypesDir)) {
          collectDeclarationFiles(atTypesDir, declarations, 3);
        }

        // Check package's own types
        const pkgDir = path.join(baseDir, "node_modules", pkgName);
        const indexDts = path.join(pkgDir, "index.d.ts");
        if (
          fs.existsSync(indexDts) &&
          !declarations.some((d) => d.path === indexDts)
        ) {
          declarations.push({
            path: indexDts,
            content: fs.readFileSync(indexDts, "utf-8"),
          });
        }

        if (declarations.length > 0) {
          results[pkgName] = declarations;
        }
      }

      res.json({ results });
    } catch (error) {
      res.status(500).json({
        error: "Failed to resolve type declarations",
        details: (error as Error).message,
      });
    }
  });

  return router;
}

/**
 * Recursively collects `.d.ts` files from a directory, up to a max depth.
 * Limits total files to prevent loading huge type packages.
 */
function collectDeclarationFiles(
  dir: string,
  results: Array<{ path: string; content: string }>,
  maxDepth: number,
  currentDepth = 0,
  maxFiles = 20,
): void {
  if (currentDepth > maxDepth || results.length >= maxFiles) return;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxFiles) break;

      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        collectDeclarationFiles(
          entryPath,
          results,
          maxDepth,
          currentDepth + 1,
          maxFiles,
        );
      } else if (entry.isFile() && entry.name.endsWith(".d.ts")) {
        try {
          results.push({
            path: entryPath,
            content: fs.readFileSync(entryPath, "utf-8"),
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}
