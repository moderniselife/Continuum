import { Router, type Request, type Response } from "express";
import { WebIDE } from "../ide/WebIDE.js";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// ============================================================
// Types
// ============================================================

interface RuleFrontmatter {
  name?: string;
  description?: string;
  alwaysApply?: boolean;
  globs?: string[];
}

interface Rule {
  name: string;
  slug: string;
  source: "workspace" | "global" | "dotfile" | "agent-file" | "colocated";
  path: string;
  description: string;
  alwaysApply: boolean;
  globs: string[];
  content: string;
  enabled: boolean;
}

interface RulePolicy {
  [slug: string]: "on" | "off";
}

// ============================================================
// YAML Frontmatter Helpers
// ============================================================

/**
 * Parses markdown content with optional YAML frontmatter delimited
 * by `---` fences. Returns the parsed frontmatter key-values and
 * the remaining body content.
 */
function parseFrontmatter(raw: string): {
  frontmatter: RuleFrontmatter;
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
 * Minimal YAML key-value parser. Handles:
 * - string values (with or without quotes)
 * - boolean values (true/false)
 * - simple inline arrays: ["a", "b"]
 */
function parseSimpleYaml(yaml: string): RuleFrontmatter {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const colonIdx = trimmedLine.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmedLine.substring(0, colonIdx).trim();
    let value: string | boolean | string[] = trimmedLine
      .substring(colonIdx + 1)
      .trim();

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Parse booleans
    if (value === "true") {
      result[key] = true;
      continue;
    }
    if (value === "false") {
      result[key] = false;
      continue;
    }

    // Parse inline arrays: ["*.ts", "*.tsx"]
    if (
      typeof value === "string" &&
      value.startsWith("[") &&
      value.endsWith("]")
    ) {
      const inner = value.slice(1, -1);
      result[key] = inner
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter((item) => item.length > 0);
      continue;
    }

    result[key] = value;
  }

  return result as RuleFrontmatter;
}

/**
 * Serialises frontmatter and body back into a markdown string
 * with `---` delimiters.
 */
function buildMarkdownWithFrontmatter(
  frontmatter: RuleFrontmatter,
  body: string,
): string {
  const lines: string[] = ["---"];

  if (frontmatter.name !== undefined) {
    lines.push(`name: ${frontmatter.name}`);
  }
  if (frontmatter.description !== undefined) {
    lines.push(`description: ${frontmatter.description}`);
  }
  if (frontmatter.alwaysApply !== undefined) {
    lines.push(`alwaysApply: ${frontmatter.alwaysApply}`);
  }
  if (frontmatter.globs !== undefined && frontmatter.globs.length > 0) {
    const globsStr = frontmatter.globs.map((g) => `"${g}"`).join(", ");
    lines.push(`globs: [${globsStr}]`);
  }

  lines.push("---");
  lines.push("");
  lines.push(body);

  return lines.join("\n");
}

/**
 * Generates a URL-safe slug from a rule name or filename.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ============================================================
// Route Factory
// ============================================================

/**
 * Creates Express router routes for rules management within
 * the Continuum Web IDE.
 *
 * Rules are sourced from workspace `.continuum/rules/`, global
 * `~/.continuum/rules/`, dotfiles (`.continuerules`), agent
 * files (`AGENTS.md`, `AGENT.md`, `CLAUDE.md`), and colocated
 * `rules.md` files throughout the workspace.
 *
 * @param webIde - The shared WebIDE instance for filesystem access.
 * @returns An Express Router with rule management endpoints.
 */
export function createRulesRoutes(webIde: WebIDE): Router {
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
   * Returns the global Continuum configuration directory.
   */
  function getGlobalConfigDir(): string {
    return path.join(os.homedir(), ".continuum");
  }

  /**
   * Loads rule policies from `.continuum/rule-policies.json` in
   * the first workspace directory.
   */
  async function loadPolicies(): Promise<RulePolicy> {
    const dirs = await getWorkspaceDirs();
    if (dirs.length === 0) return {};

    const policyPath = path.join(dirs[0], ".continuum", "rule-policies.json");
    try {
      if (fs.existsSync(policyPath)) {
        const raw = fs.readFileSync(policyPath, "utf-8");
        return JSON.parse(raw) as RulePolicy;
      }
    } catch {
      // Ignore malformed policy file
    }
    return {};
  }

  /**
   * Saves rule policies to `.continuum/rule-policies.json`.
   */
  async function savePolicies(policies: RulePolicy): Promise<void> {
    const dirs = await getWorkspaceDirs();
    if (dirs.length === 0) return;

    const policyDir = path.join(dirs[0], ".continuum");
    if (!fs.existsSync(policyDir)) {
      fs.mkdirSync(policyDir, { recursive: true });
    }

    const policyPath = path.join(policyDir, "rule-policies.json");
    fs.writeFileSync(policyPath, JSON.stringify(policies, null, 2), "utf-8");
  }

  /**
   * Scans a directory for `.md` rule files and returns parsed Rule objects.
   */
  function scanRulesDir(
    dirPath: string,
    source: Rule["source"],
    policies: RulePolicy,
  ): Rule[] {
    const rules: Rule[] = [];

    if (!fs.existsSync(dirPath)) return rules;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

        const filePath = path.join(dirPath, entry.name);
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const { frontmatter, body } = parseFrontmatter(raw);
          const slug = slugify(frontmatter.name || entry.name);

          rules.push({
            name: frontmatter.name || entry.name.replace(/\.md$/, ""),
            slug,
            source,
            path: filePath,
            description: frontmatter.description || "",
            alwaysApply: frontmatter.alwaysApply ?? false,
            globs: frontmatter.globs ?? [],
            content: body,
            enabled: policies[slug] !== "off",
          });
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Skip unreadable directories
    }

    return rules;
  }

  /**
   * Reads a single always-applied rule file (dotfile or agent file).
   */
  function readAlwaysAppliedFile(
    filePath: string,
    source: Rule["source"],
    policies: RulePolicy,
  ): Rule | null {
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const basename = path.basename(filePath);
      const slug = slugify(basename);

      // Agent files and dotfiles may have frontmatter
      const { frontmatter, body } = parseFrontmatter(raw);

      return {
        name: frontmatter.name || basename,
        slug,
        source,
        path: filePath,
        description:
          frontmatter.description || `Always-applied rule from ${basename}`,
        alwaysApply: true,
        globs: frontmatter.globs ?? [],
        content: body || raw,
        enabled: policies[slug] !== "off",
      };
    } catch {
      return null;
    }
  }

  /**
   * Recursively finds colocated `rules.md` files throughout the workspace.
   * Limits depth to prevent excessive traversal.
   */
  function findColocatedRules(
    rootDir: string,
    policies: RulePolicy,
    maxDepth = 10,
  ): Rule[] {
    const rules: Rule[] = [];

    function walk(dir: string, depth: number): void {
      if (depth > maxDepth || rules.length > 100) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const entryPath = path.join(dir, entry.name);

          if (entry.isFile() && entry.name === "rules.md") {
            try {
              const raw = fs.readFileSync(entryPath, "utf-8");
              const { frontmatter, body } = parseFrontmatter(raw);
              const relativePath = path.relative(rootDir, dir);
              const slug = slugify(`colocated-${relativePath || "root"}-rules`);

              rules.push({
                name: frontmatter.name || `Rules (${relativePath || "root"})`,
                slug,
                source: "colocated",
                path: entryPath,
                description:
                  frontmatter.description ||
                  `Directory-scoped rules for ${relativePath || "root"}`,
                alwaysApply: frontmatter.alwaysApply ?? false,
                globs: frontmatter.globs ?? [],
                content: body || raw,
                enabled: policies[slug] !== "off",
              });
            } catch {
              // Skip unreadable files
            }
          } else if (entry.isDirectory()) {
            // Skip common directories that shouldn't be traversed
            if (
              entry.name === "node_modules" ||
              entry.name === ".git" ||
              entry.name === "dist" ||
              entry.name === "build" ||
              entry.name === ".next" ||
              entry.name === "coverage"
            ) {
              continue;
            }
            walk(entryPath, depth + 1);
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    walk(rootDir, 0);
    return rules;
  }

  // ============================================================
  // Endpoints
  // ============================================================

  /**
   * GET /rules
   * Lists all rules from every source: workspace, global, dotfiles,
   * agent files, and colocated rules.md files.
   */
  router.get("/rules", async (_req: Request, res: Response) => {
    try {
      const dirs = await getWorkspaceDirs();
      const policies = await loadPolicies();
      const allRules: Rule[] = [];

      for (const dir of dirs) {
        // Workspace rules: .continuum/rules/
        const workspaceRulesDir = path.join(dir, ".continuum", "rules");
        allRules.push(
          ...scanRulesDir(workspaceRulesDir, "workspace", policies),
        );

        // Dotfile: .continuerules
        const dotfile = readAlwaysAppliedFile(
          path.join(dir, ".continuerules"),
          "dotfile",
          policies,
        );
        if (dotfile) allRules.push(dotfile);

        // Agent files: AGENTS.md, AGENT.md, CLAUDE.md
        const agentFiles = ["AGENTS.md", "AGENT.md", "CLAUDE.md"];
        for (const agentFile of agentFiles) {
          const rule = readAlwaysAppliedFile(
            path.join(dir, agentFile),
            "agent-file",
            policies,
          );
          if (rule) allRules.push(rule);
        }

        // Colocated rules.md files
        allRules.push(...findColocatedRules(dir, policies));
      }

      // Global rules: ~/.continuum/rules/
      const globalRulesDir = path.join(getGlobalConfigDir(), "rules");
      allRules.push(...scanRulesDir(globalRulesDir, "global", policies));

      res.json({ rules: allRules });
    } catch (error) {
      res.status(500).json({
        error: "Failed to list rules",
        details: (error as Error).message,
      });
    }
  });

  /**
   * POST /rules
   * Creates a new rule as a markdown file with YAML frontmatter.
   * Body: { name, description, content, scope, alwaysApply?, globs? }
   */
  router.post("/rules", async (req: Request, res: Response) => {
    try {
      const { name, description, content, scope, alwaysApply, globs } =
        req.body as {
          name?: string;
          description?: string;
          content?: string;
          scope?: "workspace" | "global";
          alwaysApply?: boolean;
          globs?: string[];
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

      let rulesDir: string;
      if (scope === "global") {
        rulesDir = path.join(getGlobalConfigDir(), "rules");
      } else {
        const dirs = await getWorkspaceDirs();
        if (dirs.length === 0) {
          res
            .status(400)
            .json({ error: "No workspace directories configured" });
          return;
        }
        rulesDir = path.join(dirs[0], ".continuum", "rules");
      }

      // Ensure the rules directory exists
      if (!fs.existsSync(rulesDir)) {
        fs.mkdirSync(rulesDir, { recursive: true });
      }

      const filename = `${slugify(name)}.md`;
      const filePath = path.join(rulesDir, filename);

      if (fs.existsSync(filePath)) {
        res.status(409).json({ error: "A rule with this name already exists" });
        return;
      }

      const frontmatter: RuleFrontmatter = {
        name,
        description: description || "",
        alwaysApply: alwaysApply ?? false,
        globs: globs ?? [],
      };

      const markdown = buildMarkdownWithFrontmatter(frontmatter, content);
      fs.writeFileSync(filePath, markdown, "utf-8");

      res.status(201).json({
        created: true,
        path: filePath,
        slug: slugify(name),
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to create rule",
        details: (error as Error).message,
      });
    }
  });

  /**
   * PUT /rules
   * Updates an existing rule file. The `path` field identifies the rule.
   * Body: { path, content, frontmatter? }
   */
  router.put("/rules", async (req: Request, res: Response) => {
    try {
      const {
        path: rulePath,
        content,
        frontmatter,
      } = req.body as {
        path?: string;
        content?: string;
        frontmatter?: RuleFrontmatter;
      };

      if (!rulePath || typeof rulePath !== "string") {
        res.status(400).json({ error: "Path is required" });
        return;
      }

      const resolved = path.resolve(rulePath);

      // Validate path is within workspace or global config
      const dirs = await getWorkspaceDirs();
      const globalDir = getGlobalConfigDir();
      const allowedDirs = [...dirs, globalDir];

      const isAllowed = allowedDirs.some((dir) => {
        const resolvedDir = path.resolve(dir);
        return (
          resolved === resolvedDir ||
          resolved.startsWith(resolvedDir + path.sep)
        );
      });

      if (!isAllowed) {
        res.status(403).json({
          error: "Access denied: path is outside allowed directories",
        });
        return;
      }

      if (!fs.existsSync(resolved)) {
        res.status(404).json({ error: "Rule file not found" });
        return;
      }

      if (content !== undefined && frontmatter !== undefined) {
        // Rebuild the full file with new frontmatter and content
        const markdown = buildMarkdownWithFrontmatter(frontmatter, content);
        fs.writeFileSync(resolved, markdown, "utf-8");
      } else if (content !== undefined) {
        // Preserve existing frontmatter, replace body
        const existing = fs.readFileSync(resolved, "utf-8");
        const { frontmatter: existingFm } = parseFrontmatter(existing);
        const markdown = buildMarkdownWithFrontmatter(existingFm, content);
        fs.writeFileSync(resolved, markdown, "utf-8");
      } else if (frontmatter !== undefined) {
        // Update only frontmatter, preserve body
        const existing = fs.readFileSync(resolved, "utf-8");
        const { body: existingBody } = parseFrontmatter(existing);
        const markdown = buildMarkdownWithFrontmatter(
          frontmatter,
          existingBody,
        );
        fs.writeFileSync(resolved, markdown, "utf-8");
      } else {
        res
          .status(400)
          .json({ error: "Either content or frontmatter is required" });
        return;
      }

      res.json({ updated: true, path: resolved });
    } catch (error) {
      res.status(500).json({
        error: "Failed to update rule",
        details: (error as Error).message,
      });
    }
  });

  /**
   * DELETE /rules
   * Deletes a rule file. Validates the path is within workspace or
   * global config directories.
   * Body: { path }
   */
  router.delete("/rules", async (req: Request, res: Response) => {
    try {
      const { path: rulePath } = req.body as { path?: string };

      if (!rulePath || typeof rulePath !== "string") {
        res.status(400).json({ error: "Path is required" });
        return;
      }

      const resolved = path.resolve(rulePath);

      // Validate path is within workspace or global config
      const dirs = await getWorkspaceDirs();
      const globalDir = getGlobalConfigDir();
      const allowedDirs = [...dirs, globalDir];

      const isAllowed = allowedDirs.some((dir) => {
        const resolvedDir = path.resolve(dir);
        return (
          resolved === resolvedDir ||
          resolved.startsWith(resolvedDir + path.sep)
        );
      });

      if (!isAllowed) {
        res.status(403).json({
          error: "Access denied: path is outside allowed directories",
        });
        return;
      }

      if (!fs.existsSync(resolved)) {
        res.status(404).json({ error: "Rule file not found" });
        return;
      }

      fs.rmSync(resolved, { force: true });
      res.json({ deleted: true, path: resolved });
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete rule",
        details: (error as Error).message,
      });
    }
  });

  /**
   * PATCH /rules/policy
   * Toggles a rule on or off by slug. Policies are stored in
   * `.continuum/rule-policies.json`.
   * Body: { slug, policy: 'on' | 'off' }
   */
  router.patch("/rules/policy", async (req: Request, res: Response) => {
    try {
      const { slug, policy } = req.body as {
        slug?: string;
        policy?: "on" | "off";
      };

      if (!slug || typeof slug !== "string") {
        res.status(400).json({ error: "Slug is required" });
        return;
      }

      if (!policy || !["on", "off"].includes(policy)) {
        res.status(400).json({ error: "Policy must be 'on' or 'off'" });
        return;
      }

      const policies = await loadPolicies();
      policies[slug] = policy;
      await savePolicies(policies);

      res.json({ updated: true, slug, policy });
    } catch (error) {
      res.status(500).json({
        error: "Failed to update rule policy",
        details: (error as Error).message,
      });
    }
  });

  return router;
}
