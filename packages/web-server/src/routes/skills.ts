import { Router, type Request, type Response } from "express";
import { WebIDE } from "../ide/WebIDE.js";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// ============================================================
// Types
// ============================================================

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

interface SkillSummary {
  name: string;
  description: string;
  path: string;
  source: "workspace" | "global";
  files: string[];
}

interface SkillDetail extends SkillSummary {
  content: string;
  supportingFiles: Array<{ path: string; size: number }>;
}

// ============================================================
// Frontmatter Helpers
// ============================================================

/**
 * Parses SKILL.md content with YAML frontmatter delimited
 * by `---` fences. Returns parsed frontmatter and body.
 */
function parseFrontmatter(raw: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const trimmed = raw.trimStart();

  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: raw };
  }

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: raw };
  }

  const yamlBlock = trimmed.substring(3, endIndex).trim();
  const body = trimmed.substring(endIndex + 3).trim();
  const frontmatter = parseSimpleYaml(yamlBlock);

  return { frontmatter, body };
}

/**
 * Minimal YAML key-value parser for skill frontmatter.
 * Handles string values with or without quotes.
 */
function parseSimpleYaml(yaml: string): SkillFrontmatter {
  const result: Record<string, string> = {};
  const lines = yaml.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const colonIdx = trimmedLine.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmedLine.substring(0, colonIdx).trim();
    let value = trimmedLine.substring(colonIdx + 1).trim();

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result as SkillFrontmatter;
}

/**
 * Serialises frontmatter and body into a markdown string
 * with `---` delimiters.
 */
function buildSkillMarkdown(
  frontmatter: SkillFrontmatter,
  body: string,
): string {
  const lines: string[] = ["---"];

  if (frontmatter.name !== undefined) {
    lines.push(`name: ${frontmatter.name}`);
  }
  if (frontmatter.description !== undefined) {
    lines.push(`description: ${frontmatter.description}`);
  }

  lines.push("---");
  lines.push("");
  lines.push(body);

  return lines.join("\n");
}

/**
 * Generates a URL-safe slug from a skill name.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Recursively lists all files within a directory, returning
 * paths relative to the base directory.
 */
function listFilesRecursive(
  dirPath: string,
  basePath: string = dirPath,
  maxDepth = 5,
  currentDepth = 0,
): string[] {
  const files: string[] = [];
  if (currentDepth > maxDepth) return files;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isFile()) {
        files.push(relativePath);
      } else if (entry.isDirectory()) {
        files.push(
          ...listFilesRecursive(fullPath, basePath, maxDepth, currentDepth + 1),
        );
      }
    }
  } catch {
    // Skip unreadable directories
  }

  return files;
}

// Valid subdirectories for supporting files within a skill
const VALID_SUBDIRS = new Set([
  "scripts",
  "examples",
  "resources",
  "references",
]);

// ============================================================
// Route Factory
// ============================================================

/**
 * Creates Express router routes for skills management within
 * the Continuum Web IDE.
 *
 * Skills are directories containing a SKILL.md file with YAML
 * frontmatter. They are discovered from workspace
 * `.continuum/skills/` and global `~/.continuum/skills/`.
 *
 * @param webIde - The shared WebIDE instance for filesystem access.
 * @returns An Express Router with skill management endpoints.
 */
export function createSkillsRoutes(webIde: WebIDE): Router {
  const router = Router();

  // Cache workspace dirs
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
   * Returns the global Continuum configuration directory.
   */
  function getGlobalConfigDir(): string {
    return path.join(os.homedir(), ".continuum");
  }

  /**
   * Returns all skill discovery directories with their source label.
   */
  async function getSkillsDirs(): Promise<
    Array<{ dir: string; source: "workspace" | "global" }>
  > {
    const dirs = await getWorkspaceDirs();
    const result: Array<{ dir: string; source: "workspace" | "global" }> = [];

    for (const d of dirs) {
      result.push({
        dir: path.join(d, ".continuum", "skills"),
        source: "workspace",
      });
    }

    result.push({
      dir: path.join(getGlobalConfigDir(), "skills"),
      source: "global",
    });

    return result;
  }

  /**
   * Scans a skills directory for skill subdirectories containing
   * SKILL.md and returns SkillSummary objects.
   */
  function scanSkillsDir(
    dirPath: string,
    source: "workspace" | "global",
  ): SkillSummary[] {
    const skills: SkillSummary[] = [];

    if (!fs.existsSync(dirPath)) return skills;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = path.join(dirPath, entry.name);
        const skillMdPath = path.join(skillDir, "SKILL.md");

        if (!fs.existsSync(skillMdPath)) continue;

        try {
          const raw = fs.readFileSync(skillMdPath, "utf-8");
          const { frontmatter } = parseFrontmatter(raw);
          const files = listFilesRecursive(skillDir);

          skills.push({
            name: frontmatter.name || entry.name,
            description: frontmatter.description || "",
            path: skillDir,
            source,
            files,
          });
        } catch {
          // Skip unreadable skill directories
        }
      }
    } catch {
      // Skip unreadable directories
    }

    return skills;
  }

  /**
   * Finds a skill directory by name across all discovery directories.
   * Optionally filters by scope.
   */
  async function findSkillDir(
    name: string,
    scope?: "workspace" | "global",
  ): Promise<{ dir: string; source: "workspace" | "global" } | null> {
    const skillsDirs = await getSkillsDirs();

    for (const { dir, source } of skillsDirs) {
      if (scope && source !== scope) continue;

      const skillDir = path.join(dir, name);
      const skillMdPath = path.join(skillDir, "SKILL.md");

      if (fs.existsSync(skillMdPath)) {
        return { dir: skillDir, source };
      }
    }

    return null;
  }

  // ============================================================
  // Endpoints
  // ============================================================

  /**
   * GET /skills
   * Lists all skills from workspace and global discovery directories.
   */
  router.get("/skills", async (_req: Request, res: Response) => {
    try {
      const skillsDirs = await getSkillsDirs();
      const allSkills: SkillSummary[] = [];

      for (const { dir, source } of skillsDirs) {
        allSkills.push(...scanSkillsDir(dir, source));
      }

      res.json({ skills: allSkills });
    } catch (error) {
      res.status(500).json({
        error: "Failed to list skills",
        details: (error as Error).message,
      });
    }
  });

  /**
   * GET /skills/:name
   * Returns the full detail of a skill: SKILL.md content and
   * supporting files with their sizes.
   */
  router.get("/skills/:name", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope as "workspace" | "global" | undefined;
      const found = await findSkillDir(name, scope);

      if (!found) {
        res.status(404).json({ error: `Skill '${name}' not found` });
        return;
      }

      const skillMdPath = path.join(found.dir, "SKILL.md");
      const raw = fs.readFileSync(skillMdPath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(raw);
      const files = listFilesRecursive(found.dir);

      // Collect supporting file details (everything except SKILL.md)
      const supportingFiles = files
        .filter((f) => f !== "SKILL.md")
        .map((f) => {
          const fullPath = path.join(found.dir, f);
          try {
            const stat = fs.statSync(fullPath);
            return { path: f, size: stat.size };
          } catch {
            return { path: f, size: 0 };
          }
        });

      const detail: SkillDetail = {
        name: frontmatter.name || name,
        description: frontmatter.description || "",
        path: found.dir,
        source: found.source,
        files,
        content: body,
        supportingFiles,
      };

      res.json(detail);
    } catch (error) {
      res.status(500).json({
        error: "Failed to get skill",
        details: (error as Error).message,
      });
    }
  });

  /**
   * POST /skills
   * Creates a new skill directory with SKILL.md.
   * Body: { name, description, content, scope }
   */
  router.post("/skills", async (req: Request, res: Response) => {
    try {
      const { name, description, content, scope } = req.body as {
        name?: string;
        description?: string;
        content?: string;
        scope?: "workspace" | "global";
      };

      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "Content is required" });
        return;
      }

      if (!scope || !["workspace", "global"].includes(scope)) {
        res
          .status(400)
          .json({ error: "Scope must be 'workspace' or 'global'" });
        return;
      }

      let skillsBaseDir: string;
      if (scope === "global") {
        skillsBaseDir = path.join(getGlobalConfigDir(), "skills");
      } else {
        const dirs = await getWorkspaceDirs();
        if (dirs.length === 0) {
          res
            .status(400)
            .json({ error: "No workspace directories configured" });
          return;
        }
        skillsBaseDir = path.join(dirs[0], ".continuum", "skills");
      }

      const dirName = slugify(name);
      const skillDir = path.join(skillsBaseDir, dirName);

      if (fs.existsSync(skillDir)) {
        res
          .status(409)
          .json({ error: "A skill with this name already exists" });
        return;
      }

      // Create skill directory and SKILL.md
      fs.mkdirSync(skillDir, { recursive: true });

      const frontmatter: SkillFrontmatter = {
        name,
        description: description || "",
      };

      const markdown = buildSkillMarkdown(frontmatter, content);
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), markdown, "utf-8");

      res.status(201).json({
        created: true,
        path: skillDir,
        name: dirName,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to create skill",
        details: (error as Error).message,
      });
    }
  });

  /**
   * PUT /skills/:name
   * Updates the SKILL.md content for an existing skill.
   * Body: { content, scope? }
   */
  router.put("/skills/:name", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { content, scope } = req.body as {
        content?: string;
        scope?: "workspace" | "global";
      };

      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "Content is required" });
        return;
      }

      const found = await findSkillDir(name, scope);

      if (!found) {
        res.status(404).json({ error: `Skill '${name}' not found` });
        return;
      }

      const skillMdPath = path.join(found.dir, "SKILL.md");

      // Preserve existing frontmatter, replace body
      const existing = fs.readFileSync(skillMdPath, "utf-8");
      const { frontmatter: existingFm } = parseFrontmatter(existing);
      const markdown = buildSkillMarkdown(existingFm, content);
      fs.writeFileSync(skillMdPath, markdown, "utf-8");

      res.json({ updated: true, path: found.dir });
    } catch (error) {
      res.status(500).json({
        error: "Failed to update skill",
        details: (error as Error).message,
      });
    }
  });

  /**
   * DELETE /skills/:name
   * Deletes a skill directory recursively.
   * Query: ?scope=workspace|global
   */
  router.delete("/skills/:name", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const scope = req.query.scope as "workspace" | "global" | undefined;

      const found = await findSkillDir(name, scope);

      if (!found) {
        res.status(404).json({ error: `Skill '${name}' not found` });
        return;
      }

      fs.rmSync(found.dir, { recursive: true, force: true });
      res.json({ deleted: true, path: found.dir });
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete skill",
        details: (error as Error).message,
      });
    }
  });

  /**
   * POST /skills/:name/files
   * Creates or uploads a supporting file within a skill directory.
   * Body: { filename, content, subdir? }
   * Subdir must be one of: scripts, examples, resources, references
   */
  router.post("/skills/:name/files", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { filename, content, subdir } = req.body as {
        filename?: string;
        content?: string;
        subdir?: string;
      };

      if (!filename || typeof filename !== "string") {
        res.status(400).json({ error: "Filename is required" });
        return;
      }

      if (content === undefined || typeof content !== "string") {
        res.status(400).json({ error: "Content is required" });
        return;
      }

      if (subdir && !VALID_SUBDIRS.has(subdir)) {
        res.status(400).json({
          error: `Invalid subdir. Must be one of: ${[...VALID_SUBDIRS].join(", ")}`,
        });
        return;
      }

      // Validate filename — prevent directory traversal
      if (
        filename.includes("..") ||
        filename.includes("/") ||
        filename.includes("\\")
      ) {
        res
          .status(400)
          .json({ error: "Filename must not contain path separators or '..'" });
        return;
      }

      const scope = req.query.scope as "workspace" | "global" | undefined;
      const found = await findSkillDir(name, scope);

      if (!found) {
        res.status(404).json({ error: `Skill '${name}' not found` });
        return;
      }

      const targetDir = subdir ? path.join(found.dir, subdir) : found.dir;

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filePath = path.join(targetDir, filename);
      fs.writeFileSync(filePath, content, "utf-8");

      const relativePath = path.relative(found.dir, filePath);

      res.status(201).json({
        created: true,
        path: relativePath,
        absolutePath: filePath,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to create supporting file",
        details: (error as Error).message,
      });
    }
  });

  /**
   * GET /skills/:name/files/:filepath
   * Reads the content of a supporting file within a skill directory.
   * The filepath parameter captures the rest of the URL path.
   */
  router.get("/skills/:name/files/*", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      // Express captures wildcard segments in params[0]
      const filepath = req.params[0];

      if (!filepath) {
        res.status(400).json({ error: "Filepath is required" });
        return;
      }

      // Prevent directory traversal
      if (filepath.includes("..")) {
        res.status(400).json({ error: "Invalid filepath" });
        return;
      }

      const scope = req.query.scope as "workspace" | "global" | undefined;
      const found = await findSkillDir(name, scope);

      if (!found) {
        res.status(404).json({ error: `Skill '${name}' not found` });
        return;
      }

      const fullPath = path.join(found.dir, filepath);

      // Validate the resolved path stays within the skill directory
      const resolvedFull = path.resolve(fullPath);
      const resolvedSkillDir = path.resolve(found.dir);
      if (!resolvedFull.startsWith(resolvedSkillDir + path.sep)) {
        res
          .status(403)
          .json({ error: "Access denied: path escapes skill directory" });
        return;
      }

      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        res.status(400).json({ error: "Path is a directory, not a file" });
        return;
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      res.json({
        content,
        path: filepath,
        size: stat.size,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to read supporting file",
        details: (error as Error).message,
      });
    }
  });

  return router;
}
