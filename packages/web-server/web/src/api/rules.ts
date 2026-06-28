/**
 * Continuum Web IDE — Rules REST API Client
 *
 * Standalone fetch wrappers for rule-management endpoints exposed by
 * the Continuum server. Mirrors the auth-token pattern from `files.ts`.
 *
 * @module api/rules
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
 * Generic typed fetch wrapper for rule endpoints.
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

/** Source origin of a rule — where it was discovered. */
export type RuleSource = "workspace" | "global" | "colocated" | "agent-file";

/** A single rule definition. */
export interface Rule {
  /** Display name of the rule. */
  name: string;
  /** URL-safe slug identifier. */
  slug: string;
  /** Origin of the rule (workspace, global, colocated, agent-file). */
  source: RuleSource;
  /** Filesystem path to the rule file. */
  path: string;
  /** Human-readable description of what this rule does. */
  description: string;
  /** Whether this rule is always applied regardless of context. */
  alwaysApply: boolean;
  /** Optional glob patterns that scope this rule to specific files. */
  globs?: string[];
  /** Full markdown content of the rule. */
  content: string;
  /** Whether this rule is currently enabled. */
  enabled: boolean;
}

export interface RuleListResult {
  rules: Rule[];
}

export interface MutationResult {
  success: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch all rules across all sources. */
export function listRules(): Promise<RuleListResult> {
  return apiFetch<RuleListResult>("/rules");
}

/** Create a new rule. */
export function createRule(rule: Omit<Rule, "slug">): Promise<MutationResult> {
  return apiFetch<MutationResult>("/rules", {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

/** Update an existing rule by slug. */
export function updateRule(
  slug: string,
  updates: Partial<Omit<Rule, "slug">>,
): Promise<MutationResult> {
  return apiFetch<MutationResult>(`/rules/${encodeURIComponent(slug)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

/** Delete a rule by slug. */
export function deleteRule(slug: string): Promise<MutationResult> {
  return apiFetch<MutationResult>(`/rules/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

/** Toggle a rule's enabled state. */
export function toggleRule(
  slug: string,
  enabled: boolean,
): Promise<MutationResult> {
  return apiFetch<MutationResult>(`/rules/${encodeURIComponent(slug)}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}
