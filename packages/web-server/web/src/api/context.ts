/**
 * Continuum Web IDE — Context API Client
 *
 * Provides functions for fetching workspace file lists used by the
 * @file context provider mention dropdown. Includes in-memory caching
 * to keep the dropdown snappy after the initial load.
 *
 * @module api/context
 */

import type { ContextSubmenuItem } from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Base path for all REST endpoints. */
const API_BASE = "/api/v1";

/** LocalStorage key where the bearer token is stored. */
const AUTH_TOKEN_KEY = "continuum_auth_token";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build headers with optional auth token. */
function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
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

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** In-memory cache for the workspace file list. */
let cachedFiles: ContextSubmenuItem[] | null = null;

/** Timestamp of the last cache population. */
let cacheTimestamp = 0;

/** Cache TTL in milliseconds — 60 seconds. */
const CACHE_TTL_MS = 60_000;

/** Clear the cached file list (e.g. after a file is created/deleted). */
export function invalidateFileCache(): void {
  cachedFiles = null;
  cacheTimestamp = 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all source files in the workspace for the @file mention dropdown.
 *
 * Results are cached in memory for 60 seconds to keep the dropdown
 * responsive on repeated opens.
 *
 * @param forceRefresh - If `true`, bypasses the cache.
 * @returns An array of context submenu items (file entries).
 */
export async function listAllFiles(
  forceRefresh = false,
): Promise<ContextSubmenuItem[]> {
  const now = Date.now();

  // Return cached result if still valid
  if (
    !forceRefresh &&
    cachedFiles !== null &&
    now - cacheTimestamp < CACHE_TTL_MS
  ) {
    return cachedFiles;
  }

  const url = `${API_BASE}/files/list-all?limit=5000`;
  const response = await fetch(url, { headers: buildHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch file list (${response.status})`);
  }

  const data = (await response.json()) as {
    files: Array<{ path: string; relativePath: string; name: string }>;
    total: number;
    truncated: boolean;
  };

  cachedFiles = data.files.map((f) => ({
    id: f.path,
    title: f.name,
    description: f.relativePath,
  }));

  cacheTimestamp = now;
  return cachedFiles;
}

/**
 * Read the contents of a file by its absolute path.
 *
 * @param filePath - Absolute path to the file.
 * @returns The file content as a string.
 */
export async function readFileContent(filePath: string): Promise<string> {
  const url = `${API_BASE}/files/read?path=${encodeURIComponent(filePath)}`;
  const response = await fetch(url, { headers: buildHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to read file (${response.status})`);
  }

  const data = (await response.json()) as { content: string; path: string };
  return data.content;
}
