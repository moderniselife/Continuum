/**
 * Continuum Web IDE — Git REST API Client
 *
 * Fetch wrappers for git endpoints exposed by the Continuum server.
 * Uses the same auth-token pattern as `files.ts`.
 *
 * @module api/git
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** LocalStorage key where the bearer token is stored (shared with rest.ts). */
const AUTH_TOKEN_KEY = "continuum_auth_token";

/** Base path for git endpoints. */
const GIT_API_BASE = "/api/v1/git";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build request headers, optionally including an `Authorization` bearer token.
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
 * Generic typed fetch wrapper for git endpoints.
 * Throws a descriptive `Error` for non-2xx responses.
 */
async function gitFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${GIT_API_BASE}${path}`;

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
      `Git API ${options.method ?? "GET"} ${path} failed (${response.status}): ${errorBody}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "untracked"
  | "renamed"
  | "copied"
  | "unknown";

export interface GitStatusFile {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  originalPath?: string;
}

export interface GitStatusResponse {
  branch: string;
  files: GitStatusFile[];
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  relativeDate: string;
}

export interface GitLogResponse {
  commits: GitCommit[];
}

export interface GitDiffResponse {
  diff: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Retrieve parsed git status (branch + file list). */
export function getGitStatus(): Promise<GitStatusResponse> {
  return gitFetch<GitStatusResponse>("/status");
}

/** Retrieve recent commit log. */
export function getGitLog(count = 20): Promise<GitLogResponse> {
  return gitFetch<GitLogResponse>(`/log?count=${count}`);
}

/** Stage files for commit. */
export function stageFiles(
  files: string[],
): Promise<{ staged: boolean; files: string[] }> {
  return gitFetch<{ staged: boolean; files: string[] }>("/stage", {
    method: "POST",
    body: JSON.stringify({ files }),
  });
}

/** Unstage files (reset from index). */
export function unstageFiles(
  files: string[],
): Promise<{ unstaged: boolean; files: string[] }> {
  return gitFetch<{ unstaged: boolean; files: string[] }>("/unstage", {
    method: "POST",
    body: JSON.stringify({ files }),
  });
}

/** Create a commit with the given message. */
export function createCommit(
  message: string,
): Promise<{ committed: boolean; output: string }> {
  return gitFetch<{ committed: boolean; output: string }>("/commit", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/** Get diff for a specific file or the entire working tree. */
export function getGitDiff(
  file?: string,
  staged = false,
): Promise<GitDiffResponse> {
  const params = new URLSearchParams();
  if (file) params.set("file", file);
  if (staged) params.set("staged", "true");
  const qs = params.toString();
  return gitFetch<GitDiffResponse>(`/diff${qs ? `?${qs}` : ""}`);
}

// ---------------------------------------------------------------------------
// Submodule types
// ---------------------------------------------------------------------------

export type GitSubmoduleStatus = "up-to-date" | "modified" | "uninitialized";

export interface GitSubmodule {
  name: string;
  path: string;
  url: string;
  commit: string;
  status: GitSubmoduleStatus;
  branch?: string;
}

export interface GitSubmodulesResponse {
  submodules: GitSubmodule[];
}

export interface GitSubmoduleDetailResponse {
  branch: string;
  files: GitStatusFile[];
  recentCommits: GitCommit[];
}

export interface GitSubmoduleCommitResponse {
  success: boolean;
  hash?: string;
  error?: string;
}

export interface GitSubmoduleUpdateResponse {
  staged: string[];
}

// ---------------------------------------------------------------------------
// Submodule API
// ---------------------------------------------------------------------------

/** List all git submodules with their current status. */
export function listSubmodules(): Promise<GitSubmodulesResponse> {
  return gitFetch<GitSubmodulesResponse>("/submodules");
}

/** Get detailed status for a single submodule. */
export function getSubmoduleStatus(
  name: string,
): Promise<GitSubmoduleDetailResponse> {
  return gitFetch<GitSubmoduleDetailResponse>(
    `/submodules/${encodeURIComponent(name)}/status`,
  );
}

/** Commit staged changes within a submodule. */
export function commitSubmodule(
  name: string,
  message: string,
  files?: string[],
): Promise<GitSubmoduleCommitResponse> {
  return gitFetch<GitSubmoduleCommitResponse>(
    `/submodules/${encodeURIComponent(name)}/commit`,
    {
      method: "POST",
      body: JSON.stringify({ message, files }),
    },
  );
}

/** Stage updated submodule references in the parent repository. */
export function updateSubmoduleRefs(
  submodules?: string[],
): Promise<GitSubmoduleUpdateResponse> {
  return gitFetch<GitSubmoduleUpdateResponse>("/submodules/update", {
    method: "POST",
    body: JSON.stringify({ submodules }),
  });
}
