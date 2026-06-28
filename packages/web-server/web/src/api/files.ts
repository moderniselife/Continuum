/**
 * Continuum Web IDE — File System REST API Client
 *
 * Standalone fetch wrappers for file-system endpoints exposed by the
 * Continuum server. Mirrors the auth-token pattern from `rest.ts` but
 * keeps its own `apiFetch` to avoid coupling to unexported internals.
 *
 * @module api/files
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
 * Generic typed fetch wrapper for file-system endpoints.
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
// Response types
// ---------------------------------------------------------------------------

export interface WorkspaceInfo {
  dirs: string[];
  branch: string;
  repo: string;
}

export interface DirListing {
  /** Array of [name, type] tuples. Type: 1 = file, 2 = directory. */
  entries: [string, number][];
}

export interface FileContent {
  content: string;
  path: string;
}

export interface MutationResult {
  success: boolean;
}

export interface SearchResult {
  results: string;
}

export interface FileSearchResult {
  files: string[];
}

export interface GitStatusResult {
  status: string;
}

export interface GitBranchResult {
  branch: string;
}

// ---------------------------------------------------------------------------
// Public API — Workspace & Directory
// ---------------------------------------------------------------------------

/** Retrieve workspace root directories and current git context. */
export function getWorkspace(): Promise<WorkspaceInfo> {
  return apiFetch<WorkspaceInfo>("/workspace");
}

/** List contents of a directory. Returns entries as [name, type] tuples. */
export function listDir(dirPath: string): Promise<DirListing> {
  return apiFetch<DirListing>(
    `/files/list?path=${encodeURIComponent(dirPath)}`,
  );
}

// ---------------------------------------------------------------------------
// Public API — File operations
// ---------------------------------------------------------------------------

/** Read the content of a file at the given path. */
export function readFile(filePath: string): Promise<FileContent> {
  return apiFetch<FileContent>(
    `/files/read?path=${encodeURIComponent(filePath)}`,
  );
}

/** Write content to a file, creating it if it doesn't exist. */
export function writeFile(
  filePath: string,
  contents: string,
): Promise<MutationResult> {
  return apiFetch<MutationResult>("/files/write", {
    method: "POST",
    body: JSON.stringify({ path: filePath, contents }),
  });
}

/** Create a new file or directory. */
export function createItem(
  itemPath: string,
  type: "file" | "directory",
): Promise<MutationResult> {
  return apiFetch<MutationResult>("/files/create", {
    method: "POST",
    body: JSON.stringify({ path: itemPath, type }),
  });
}

/** Delete a file or directory. */
export function deleteItem(itemPath: string): Promise<MutationResult> {
  return apiFetch<MutationResult>("/files/delete", {
    method: "DELETE",
    body: JSON.stringify({ path: itemPath }),
  });
}

/** Rename (move) a file or directory from one path to another. */
export function renameItem(from: string, to: string): Promise<MutationResult> {
  return apiFetch<MutationResult>("/files/rename", {
    method: "POST",
    body: JSON.stringify({ from, to }),
  });
}

// ---------------------------------------------------------------------------
// Public API — Search
// ---------------------------------------------------------------------------

/** Full-text search across file contents. */
export function searchContents(
  query: string,
  maxResults?: number,
): Promise<SearchResult> {
  const params = new URLSearchParams({ query });
  if (maxResults !== undefined) {
    params.set("maxResults", String(maxResults));
  }
  return apiFetch<SearchResult>(`/files/search?${params.toString()}`);
}

/** Find files by name/glob pattern. */
export function findFiles(pattern: string): Promise<FileSearchResult> {
  return apiFetch<FileSearchResult>(
    `/files/find?pattern=${encodeURIComponent(pattern)}`,
  );
}

// ---------------------------------------------------------------------------
// Public API — Git
// ---------------------------------------------------------------------------

/** Get the current git status (porcelain output). */
export function getGitStatus(): Promise<GitStatusResult> {
  return apiFetch<GitStatusResult>("/git/status");
}

/** Get the current git branch name. */
export function getGitBranch(): Promise<GitBranchResult> {
  return apiFetch<GitBranchResult>("/git/branch");
}
