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

  return router;
}
