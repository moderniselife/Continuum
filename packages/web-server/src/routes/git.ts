import { Router, type Request, type Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * File status codes from `git status --porcelain`.
 * Maps single-character codes to human-readable status strings.
 */
type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "untracked"
  | "renamed"
  | "copied"
  | "unknown";

interface GitStatusFile {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  /** Original path for renamed files. */
  originalPath?: string;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  relativeDate: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single porcelain status code character into a GitFileStatus.
 */
function parseStatusCode(code: string): GitFileStatus {
  switch (code) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "?":
      return "untracked";
    default:
      return "unknown";
  }
}

/**
 * Parse the raw output of `git status --porcelain -b` into structured data.
 *
 * The first line (starting with `##`) contains the branch information.
 * Subsequent lines describe file statuses with a two-character prefix:
 *   - Column 1: staged status
 *   - Column 2: unstaged status
 *   - Column 3: space
 *   - Remainder: file path (possibly with ` -> newPath` for renames)
 */
function parseGitStatus(raw: string): {
  branch: string;
  files: GitStatusFile[];
} {
  const lines = raw.split("\n").filter((l) => l.length > 0);
  let branch = "unknown";
  const files: GitStatusFile[] = [];

  for (const line of lines) {
    // Branch line: ## main...origin/main [ahead 2]
    if (line.startsWith("## ")) {
      const branchInfo = line.slice(3);
      // Extract just the local branch name (before any `...` tracking info)
      const dotDotDot = branchInfo.indexOf("...");
      branch = dotDotDot >= 0 ? branchInfo.slice(0, dotDotDot) : branchInfo;
      // Handle detached HEAD
      if (branch.startsWith("No commits yet on ")) {
        branch = branch.replace("No commits yet on ", "");
      }
      if (branch.startsWith("HEAD (no branch)")) {
        branch = "HEAD (detached)";
      }
      continue;
    }

    // File status line
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const filePath = line.slice(3);

    // Handle renames: "R  old.ts -> new.ts"
    let actualPath = filePath;
    let originalPath: string | undefined;
    const renameMatch = filePath.match(/^(.+) -> (.+)$/);
    if (renameMatch) {
      originalPath = renameMatch[1];
      actualPath = renameMatch[2];
    }

    // Untracked files: `?? filename`
    if (indexStatus === "?" && workTreeStatus === "?") {
      files.push({ path: actualPath, status: "untracked", staged: false });
      continue;
    }

    // Staged changes (index status is not space or ?)
    if (indexStatus !== " " && indexStatus !== "?") {
      files.push({
        path: actualPath,
        status: parseStatusCode(indexStatus),
        staged: true,
        ...(originalPath ? { originalPath } : {}),
      });
    }

    // Unstaged changes (work tree status is not space or ?)
    if (workTreeStatus !== " " && workTreeStatus !== "?") {
      // Avoid duplicate entries — only add if the staged version wasn't already
      // added with the same status
      files.push({
        path: actualPath,
        status: parseStatusCode(workTreeStatus),
        staged: false,
      });
    }
  }

  return { branch, files };
}

/**
 * Parse the raw output of `git log` with our custom format.
 * Format: `%H|%h|%s|%an|%ar`
 */
function parseGitLog(raw: string): GitCommit[] {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const parts = line.split("|");
    return {
      hash: parts[0] ?? "",
      shortHash: parts[1] ?? "",
      message: parts.slice(2, -2).join("|") ?? "",
      author: parts[parts.length - 2] ?? "",
      relativeDate: parts[parts.length - 1] ?? "",
    };
  });
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates Express router routes for Git operations within
 * the Continuum Web IDE.
 *
 * Uses `execFile` (not `exec`) to avoid shell injection.
 * All git commands are run within the first workspace directory.
 *
 * @param workspaceDirs - Array of workspace root directories.
 * @returns An Express Router with git endpoints.
 */
export function createGitRoutes(workspaceDirs: string[]): Router {
  const router = Router();

  /** The primary workspace directory for git operations. */
  function getCwd(): string {
    return workspaceDirs[0] ?? process.cwd();
  }

  // ============================================================
  // GET /status
  // ============================================================

  /**
   * Returns parsed git status with branch name and file list.
   */
  router.get("/status", async (_req: Request, res: Response) => {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["status", "--porcelain", "-b"],
        { cwd: getCwd(), timeout: 15_000 },
      );

      const result = parseGitStatus(stdout);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: "Failed to retrieve git status",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // GET /log
  // ============================================================

  /**
   * Returns the most recent commits.
   * Query: ?count=20 (default: 20)
   */
  router.get("/log", async (req: Request, res: Response) => {
    try {
      const count = parseInt((req.query.count as string) ?? "20", 10);
      const safeCount = Math.min(Math.max(1, count), 100);

      const { stdout } = await execFileAsync(
        "git",
        [
          "log",
          "--oneline",
          `-n`,
          String(safeCount),
          `--format=%H|%h|%s|%an|%ar`,
        ],
        { cwd: getCwd(), timeout: 15_000 },
      );

      const commits = parseGitLog(stdout);
      res.json({ commits });
    } catch (error) {
      // If repo has no commits yet, return empty list
      const msg = (error as Error).message ?? "";
      if (
        msg.includes("does not have any commits yet") ||
        msg.includes("bad default revision")
      ) {
        res.json({ commits: [] });
        return;
      }
      res.status(500).json({
        error: "Failed to retrieve git log",
        details: msg,
      });
    }
  });

  // ============================================================
  // POST /stage
  // ============================================================

  /**
   * Stage files for commit.
   * Body: { files: string[] }
   */
  router.post("/stage", async (req: Request, res: Response) => {
    try {
      const { files } = req.body as { files?: string[] };

      if (!files || !Array.isArray(files) || files.length === 0) {
        res
          .status(400)
          .json({ error: "A non-empty 'files' array is required" });
        return;
      }

      // Validate file paths — no absolute paths or traversal
      for (const f of files) {
        if (f.includes("..") || f.startsWith("/")) {
          res.status(400).json({
            error: `Invalid file path: ${f}`,
          });
          return;
        }
      }

      await execFileAsync("git", ["add", "--", ...files], {
        cwd: getCwd(),
        timeout: 15_000,
      });

      res.json({ staged: true, files });
    } catch (error) {
      res.status(500).json({
        error: "Failed to stage files",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // POST /unstage
  // ============================================================

  /**
   * Unstage files (reset from index).
   * Body: { files: string[] }
   */
  router.post("/unstage", async (req: Request, res: Response) => {
    try {
      const { files } = req.body as { files?: string[] };

      if (!files || !Array.isArray(files) || files.length === 0) {
        res
          .status(400)
          .json({ error: "A non-empty 'files' array is required" });
        return;
      }

      for (const f of files) {
        if (f.includes("..") || f.startsWith("/")) {
          res.status(400).json({ error: `Invalid file path: ${f}` });
          return;
        }
      }

      await execFileAsync("git", ["reset", "HEAD", "--", ...files], {
        cwd: getCwd(),
        timeout: 15_000,
      });

      res.json({ unstaged: true, files });
    } catch (error) {
      res.status(500).json({
        error: "Failed to unstage files",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // POST /commit
  // ============================================================

  /**
   * Create a commit with the given message.
   * Body: { message: string }
   */
  router.post("/commit", async (req: Request, res: Response) => {
    try {
      const { message } = req.body as { message?: string };

      if (!message || typeof message !== "string" || !message.trim()) {
        res
          .status(400)
          .json({ error: "A non-empty commit message is required" });
        return;
      }

      const { stdout } = await execFileAsync(
        "git",
        ["commit", "-m", message.trim()],
        { cwd: getCwd(), timeout: 30_000 },
      );

      res.json({ committed: true, output: stdout.trim() });
    } catch (error) {
      res.status(500).json({
        error: "Failed to create commit",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // GET /diff
  // ============================================================

  /**
   * Returns the diff for a specific file or the entire working tree.
   * Query: ?file=<relative-path>&staged=true
   */
  router.get("/diff", async (req: Request, res: Response) => {
    try {
      const file = req.query.file as string | undefined;
      const staged = req.query.staged === "true";

      const args = ["diff"];
      if (staged) {
        args.push("--cached");
      }
      if (file) {
        // Validate — no traversal
        if (file.includes("..") || file.startsWith("/")) {
          res.status(400).json({ error: `Invalid file path: ${file}` });
          return;
        }
        args.push("--", file);
      }

      const { stdout } = await execFileAsync("git", args, {
        cwd: getCwd(),
        timeout: 15_000,
        maxBuffer: 5 * 1024 * 1024, // 5 MB
      });

      res.json({ diff: stdout });
    } catch (error) {
      res.status(500).json({
        error: "Failed to retrieve diff",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // Submodule types
  // ============================================================

  interface GitSubmodule {
    name: string;
    path: string;
    url: string;
    commit: string;
    status: "up-to-date" | "modified" | "uninitialized";
    branch?: string;
  }

  // ============================================================
  // GET /submodules — List all submodules
  // ============================================================

  /**
   * Returns a list of all git submodules with their current status.
   *
   * Combines output from `git submodule status` (commit hash + status)
   * and `git config --file .gitmodules` (URL mappings).
   */
  router.get("/submodules", async (_req: Request, res: Response) => {
    try {
      const cwd = getCwd();

      // Fetch submodule status — returns lines like:
      //   " abc1234 path/to/sub (branch-name)"  — up-to-date
      //   "+abc1234 path/to/sub (branch-name)"  — modified (checked-out commit differs)
      //   "-abc1234 path/to/sub"                 — uninitialised
      let statusOutput = "";
      try {
        const result = await execFileAsync("git", ["submodule", "status"], {
          cwd,
          timeout: 15_000,
        });
        statusOutput = result.stdout;
      } catch {
        // No submodules or not a git repo — return empty list
        res.json({ submodules: [] });
        return;
      }

      const statusLines = statusOutput
        .split("\n")
        .filter((l) => l.trim().length > 0);

      if (statusLines.length === 0) {
        res.json({ submodules: [] });
        return;
      }

      // Fetch URL mappings from .gitmodules
      const urlMap: Record<string, string> = {};
      try {
        const { stdout: configOutput } = await execFileAsync(
          "git",
          [
            "config",
            "--file",
            ".gitmodules",
            "--get-regexp",
            "^submodule\\..*\\.url$",
          ],
          { cwd, timeout: 10_000 },
        );
        // Lines like: submodule.libs/core.url https://github.com/example/core.git
        for (const line of configOutput.split("\n").filter((l) => l.trim())) {
          const spaceIdx = line.indexOf(" ");
          if (spaceIdx < 0) continue;
          const key = line.slice(0, spaceIdx); // submodule.<name>.url
          const url = line.slice(spaceIdx + 1).trim();
          // Extract the submodule name from the config key
          const nameMatch = key.match(/^submodule\.(.+)\.url$/);
          if (nameMatch) {
            urlMap[nameMatch[1]] = url;
          }
        }
      } catch {
        // .gitmodules may not exist or be parseable — URLs will be empty
      }

      // Parse each submodule status line
      const submodules: GitSubmodule[] = statusLines.map((line) => {
        const prefix = line[0]; // ' ', '+', or '-'
        const rest = line.slice(1).trim();

        let commit = "";
        let subPath = "";
        let branch: string | undefined;

        // Format: "abc1234 path/to/sub (branch-name)" or "abc1234 path/to/sub"
        const parts = rest.split(/\s+/);
        commit = parts[0] ?? "";
        subPath = parts[1] ?? "";

        // Branch is in parentheses at the end, if present
        const branchMatch = rest.match(/\((.+)\)$/);
        if (branchMatch) {
          branch = branchMatch[1];
        }

        let status: GitSubmodule["status"] = "up-to-date";
        if (prefix === "+") {
          status = "modified";
        } else if (prefix === "-") {
          status = "uninitialized";
        }

        // Use the path as the name (also look up in urlMap by path)
        const name = subPath;
        const url = urlMap[subPath] ?? urlMap[name] ?? "";

        return { name, path: subPath, url, commit, status, branch };
      });

      res.json({ submodules });
    } catch (error) {
      res.status(500).json({
        error: "Failed to list submodules",
        details: (error as Error).message,
      });
    }
  });

  // ============================================================
  // GET /submodules/:name/status — Detailed submodule status
  // ============================================================

  /**
   * Returns detailed status for a single submodule, including
   * its current branch, changed files, and recent commits.
   *
   * The `:name` parameter is the submodule path (URL-encoded if necessary).
   */
  router.get(
    "/submodules/:name/status",
    async (req: Request, res: Response) => {
      try {
        const submoduleName = req.params.name;
        if (
          !submoduleName ||
          submoduleName.includes("..") ||
          submoduleName.startsWith("/")
        ) {
          res
            .status(400)
            .json({ error: `Invalid submodule name: ${submoduleName}` });
          return;
        }

        const cwd = getCwd();
        const subCwd = `${cwd}/${submoduleName}`;

        // Get branch and file status
        const { stdout: statusOut } = await execFileAsync(
          "git",
          ["status", "--porcelain", "-b"],
          { cwd: subCwd, timeout: 15_000 },
        );

        const parsed = parseGitStatus(statusOut);

        // Get recent commits
        let recentCommits: GitCommit[] = [];
        try {
          const { stdout: logOut } = await execFileAsync(
            "git",
            ["log", "--oneline", "-n", "5", "--format=%H|%h|%s|%an|%ar"],
            { cwd: subCwd, timeout: 15_000 },
          );
          recentCommits = parseGitLog(logOut);
        } catch {
          // Submodule may have no commits — return empty
        }

        res.json({
          branch: parsed.branch,
          files: parsed.files,
          recentCommits,
        });
      } catch (error) {
        res.status(500).json({
          error: "Failed to retrieve submodule status",
          details: (error as Error).message,
        });
      }
    },
  );

  // ============================================================
  // POST /submodules/:name/commit — Commit within a submodule
  // ============================================================

  /**
   * Stage files and create a commit within a submodule.
   *
   * Body: `{ message: string, files?: string[] }`
   * If `files` is omitted or empty, all changes are staged (`git add -A`).
   */
  router.post(
    "/submodules/:name/commit",
    async (req: Request, res: Response) => {
      try {
        const submoduleName = req.params.name;
        if (
          !submoduleName ||
          submoduleName.includes("..") ||
          submoduleName.startsWith("/")
        ) {
          res
            .status(400)
            .json({ error: `Invalid submodule name: ${submoduleName}` });
          return;
        }

        const { message, files } = req.body as {
          message?: string;
          files?: string[];
        };

        if (!message || typeof message !== "string" || !message.trim()) {
          res
            .status(400)
            .json({ error: "A non-empty commit message is required" });
          return;
        }

        const cwd = getCwd();
        const subCwd = `${cwd}/${submoduleName}`;

        // Stage files — either specific files or all changes
        if (files && Array.isArray(files) && files.length > 0) {
          for (const f of files) {
            if (f.includes("..") || f.startsWith("/")) {
              res.status(400).json({ error: `Invalid file path: ${f}` });
              return;
            }
          }
          await execFileAsync("git", ["add", "--", ...files], {
            cwd: subCwd,
            timeout: 15_000,
          });
        } else {
          await execFileAsync("git", ["add", "-A"], {
            cwd: subCwd,
            timeout: 15_000,
          });
        }

        // Commit
        const { stdout } = await execFileAsync(
          "git",
          ["commit", "-m", message.trim()],
          { cwd: subCwd, timeout: 30_000 },
        );

        // Extract the commit hash from output
        const hashMatch = stdout.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
        const hash = hashMatch?.[1] ?? "";

        res.json({ success: true, hash });
      } catch (error) {
        const errMsg = (error as Error).message ?? "";
        // "nothing to commit" is not a hard failure
        if (errMsg.includes("nothing to commit")) {
          res.json({ success: false, error: "Nothing to commit in submodule" });
          return;
        }
        res.status(500).json({
          success: false,
          error: "Failed to commit in submodule",
          details: errMsg,
        });
      }
    },
  );

  // ============================================================
  // POST /submodules/update — Stage submodule refs in parent
  // ============================================================

  /**
   * Stage updated submodule references in the parent repository.
   *
   * Body: `{ submodules?: string[] }`
   * If `submodules` is omitted or empty, all known submodule paths are staged.
   */
  router.post("/submodules/update", async (req: Request, res: Response) => {
    try {
      const { submodules } = req.body as { submodules?: string[] };
      const cwd = getCwd();

      let pathsToStage: string[] = [];

      if (submodules && Array.isArray(submodules) && submodules.length > 0) {
        // Validate paths
        for (const s of submodules) {
          if (s.includes("..") || s.startsWith("/")) {
            res.status(400).json({ error: `Invalid submodule path: ${s}` });
            return;
          }
        }
        pathsToStage = submodules;
      } else {
        // Discover all submodule paths
        try {
          const { stdout } = await execFileAsync(
            "git",
            ["submodule", "status"],
            { cwd, timeout: 15_000 },
          );
          const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
          pathsToStage = lines
            .map((line) => {
              const parts = line.slice(1).trim().split(/\s+/);
              return parts[1] ?? "";
            })
            .filter((p) => p.length > 0);
        } catch {
          res.json({ staged: [] });
          return;
        }
      }

      if (pathsToStage.length === 0) {
        res.json({ staged: [] });
        return;
      }

      // Stage the submodule paths in the parent repo
      await execFileAsync("git", ["add", "--", ...pathsToStage], {
        cwd,
        timeout: 15_000,
      });

      res.json({ staged: pathsToStage });
    } catch (error) {
      res.status(500).json({
        error: "Failed to update submodule references",
        details: (error as Error).message,
      });
    }
  });

  return router;
}
