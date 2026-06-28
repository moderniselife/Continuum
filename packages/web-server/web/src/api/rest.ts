/**
 * Continuum Web IDE — REST API Client
 *
 * Thin fetch wrapper for JSON endpoints exposed by the Continuum server.
 * Automatically injects the auth token from localStorage when present.
 *
 * @module api/rest
 */

import type {
  HealthResponse,
  ModelInfo,
  Session,
  SessionMetadata,
} from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** LocalStorage key where the bearer token is stored. */
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
 * Generic typed fetch wrapper.
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
// Public API
// ---------------------------------------------------------------------------

/** Check server health and version. */
export function health(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}

// -- Sessions ---------------------------------------------------------------

/** List all sessions (lightweight metadata only). */
export function listSessions(): Promise<{
  sessions: SessionMetadata[];
  total: number;
  offset: number;
  limit: number;
}> {
  return apiFetch<{
    sessions: SessionMetadata[];
    total: number;
    offset: number;
    limit: number;
  }>("/sessions");
}

/** Retrieve a full session by ID, including message history. */
export function getSession(id: string): Promise<Session> {
  return apiFetch<Session>(`/sessions/${encodeURIComponent(id)}`);
}

/** Permanently delete a session. */
export function deleteSession(id: string): Promise<void> {
  return apiFetch<void>(`/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// -- Configuration ----------------------------------------------------------

/** Retrieve the current server configuration. */
export function getConfig<T = Record<string, unknown>>(): Promise<T> {
  return apiFetch<T>("/config");
}

/** Get the raw config file contents as a string (for Monaco editor). */
export async function getRawConfig(): Promise<string> {
  const url = `${API_BASE}/config/raw`;
  const response = await fetch(url, {
    headers: buildHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch raw config (${response.status})`);
  }
  return response.text();
}

/** Get the config file path on disk. */
export async function getConfigPath(): Promise<string> {
  const data = await apiFetch<{ path: string }>("/config/path");
  return data.path;
}

/** Save raw config content (YAML string) to disk with server-side validation. */
export async function saveRawConfig(
  content: string,
): Promise<{ updated: boolean; error?: string; details?: string }> {
  const url = `${API_BASE}/config`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...buildHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  const data = await response.json();
  if (!response.ok) {
    return {
      updated: false,
      error: data.error ?? "Failed to save config",
      details: data.details,
    };
  }
  return { updated: true };
}

/** Partially update server configuration. */
export function updateConfig(
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/config", {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}

// -- Models -----------------------------------------------------------------

/** List all available LLM models. */
export function getModels(): Promise<{ models: ModelInfo[] }> {
  return apiFetch<{ models: ModelInfo[] }>("/models");
}

// ---------------------------------------------------------------------------
// Auth token helpers (consumed by other modules)
// ---------------------------------------------------------------------------

/** Persist a bearer token in localStorage. */
export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    console.warn("[rest] Unable to persist auth token to localStorage.");
  }
}

/** Remove the stored bearer token. */
export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Silently ignore.
  }
}

/** Read the current bearer token (or `null`). */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}
