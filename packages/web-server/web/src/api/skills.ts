/**
 * Continuum Web IDE — Skills REST API Client
 *
 * Standalone fetch wrappers for skill-management endpoints exposed by
 * the Continuum server. Mirrors the auth-token pattern from `files.ts`.
 *
 * @module api/skills
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** LocalStorage key where the bearer token is stored (shared with rest.ts). */
const AUTH_TOKEN_KEY = "continuum_auth_token";

/** Base path for all REST endpoints. */
const API_BASE = "/api/v1";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build request headers, optionally including an `Authorization` bearer token
 * when one exists in localStorage.
 */
function buildHeaders(extra: Record<string, string> = {}): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };

  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch {
    // localStorage may be unavailable in some contexts — silently skip.
  }

  return headers;
}

/**
 * Generic typed fetch wrapper for skill endpoints.
 * Throws a descriptive `Error` for non-2xx responses.
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options.headers as Record<string, string>),
  });

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // Ignore — we already know it failed.
    }
    throw new Error(
      `API ${options.method ?? "GET"} ${path} failed (${response.status}): ${errorBody}`,
    );
  }

  // 204 No Content — nothing to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Source origin of a skill. */
export type SkillSource = "workspace" | "global";

/** A supporting file within a skill directory. */
export interface SkillFile {
  /** File basename. */
  name: string;
  /** Full filesystem path. */
  path: string;
  /** File size in bytes. */
  size: number;
}

/** A skill definition with optional full content. */
export interface Skill {
  /** Display name from SKILL.md frontmatter. */
  name: string;
  /** Description from SKILL.md frontmatter. */
  description: string;
  /** Filesystem path to the skill directory. */
  path: string;
  /** Origin of the skill (workspace or global). */
  source: SkillSource;
  /** Full SKILL.md content (loaded on detail fetch). */
  content?: string;
  /** Supporting files in the skill directory. */
  files: SkillFile[];
}

export interface SkillListResult {
  skills: Skill[];
}

export interface SkillDetailResult {
  skill: Skill;
}

export interface MutationResult {
  success: boolean;
}

export interface FileContentResult {
  content: string;
  path: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch all skills across all sources. */
export function listSkills(): Promise<SkillListResult> {
  return apiFetch<SkillListResult>("/skills");
}

/** Fetch full details of a single skill (including SKILL.md content). */
export function getSkill(skillPath: string): Promise<SkillDetailResult> {
  return apiFetch<SkillDetailResult>(
    `/skills/detail?path=${encodeURIComponent(skillPath)}`,
  );
}

/** Create a new skill. */
export function createSkill(
  skill: Pick<Skill, "name" | "description" | "source" | "content">,
): Promise<MutationResult> {
  return apiFetch<MutationResult>("/skills", {
    method: "POST",
    body: JSON.stringify(skill),
  });
}

/** Update an existing skill's metadata or content. */
export function updateSkill(
  skillPath: string,
  updates: Partial<Pick<Skill, "name" | "description" | "content">>,
): Promise<MutationResult> {
  return apiFetch<MutationResult>("/skills/update", {
    method: "PUT",
    body: JSON.stringify({ path: skillPath, ...updates }),
  });
}

/** Delete a skill by path. */
export function deleteSkill(skillPath: string): Promise<MutationResult> {
  return apiFetch<MutationResult>("/skills/delete", {
    method: "DELETE",
    body: JSON.stringify({ path: skillPath }),
  });
}

/** Upload a supporting file to a skill directory. */
export function uploadSkillFile(
  skillPath: string,
  fileName: string,
  content: string,
): Promise<MutationResult> {
  return apiFetch<MutationResult>("/skills/files/upload", {
    method: "POST",
    body: JSON.stringify({ skillPath, fileName, content }),
  });
}

/** Read a supporting file from a skill directory. */
export function readSkillFile(filePath: string): Promise<FileContentResult> {
  return apiFetch<FileContentResult>(
    `/skills/files/read?path=${encodeURIComponent(filePath)}`,
  );
}
