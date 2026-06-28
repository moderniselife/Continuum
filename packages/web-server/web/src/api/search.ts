/**
 * Continuum Web IDE — File Search REST API Client
 *
 * Fetch wrapper for the enhanced search endpoint with support for
 * case sensitivity, regex, and glob filters.
 *
 * @module api/search
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const AUTH_TOKEN_KEY = "continuum_auth_token";
const API_BASE = "/api/v1";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
    // localStorage may be unavailable — silently skip.
  }

  return headers;
}

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
      // Ignore
    }
    throw new Error(
      `API ${options.method ?? "GET"} ${path} failed (${response.status}): ${errorBody}`,
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

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchResponse {
  results: SearchMatch[];
  totalMatches: number;
  truncated: boolean;
}

export interface SearchOptions {
  q: string;
  caseSensitive?: boolean;
  regex?: boolean;
  include?: string;
  exclude?: string;
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search file contents across the workspace.
 *
 * @param options - Search parameters including query, filters, and limits.
 * @returns Structured search results with match positions.
 */
export function searchFiles(options: SearchOptions): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: options.q });

  if (options.caseSensitive) params.set("caseSensitive", "true");
  if (options.regex) params.set("regex", "true");
  if (options.include) params.set("include", options.include);
  if (options.exclude) params.set("exclude", options.exclude);
  if (options.maxResults !== undefined) {
    params.set("maxResults", String(options.maxResults));
  }

  return apiFetch<SearchResponse>(`/files/search?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Replace types
// ---------------------------------------------------------------------------

export interface ReplaceInFileRequest {
  filePath: string;
  line: number;
  searchText: string;
  replaceText: string;
  caseSensitive?: boolean;
  regex?: boolean;
}

export interface ReplaceInFileResponse {
  replaced: boolean;
  newContent?: string;
}

export interface ReplaceAllRequest {
  searchText: string;
  replaceText: string;
  caseSensitive?: boolean;
  regex?: boolean;
  include?: string;
  exclude?: string;
}

export interface ReplaceAllResponse {
  filesModified: number;
  replacementsCount: number;
  files: string[];
}

// ---------------------------------------------------------------------------
// Replace API
// ---------------------------------------------------------------------------

/**
 * Replace a single match within a specific file at the given line.
 *
 * @param options - The file path, line number, search/replace text, and options.
 * @returns Whether the replacement was made and the new file content.
 */
export function replaceInFile(
  options: ReplaceInFileRequest,
): Promise<ReplaceInFileResponse> {
  return apiFetch<ReplaceInFileResponse>("/files/replace", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

/**
 * Replace all occurrences of a search term across the entire workspace.
 *
 * @param options - The search/replace text, case sensitivity, regex mode, and glob filters.
 * @returns The number of files modified, total replacements, and list of modified file paths.
 */
export function replaceAll(
  options: ReplaceAllRequest,
): Promise<ReplaceAllResponse> {
  return apiFetch<ReplaceAllResponse>("/files/replace-all", {
    method: "POST",
    body: JSON.stringify(options),
  });
}
