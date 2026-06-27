import type { Request, Response, NextFunction } from "express";

/**
 * Token-based authentication middleware for the Continuum Web Server.
 *
 * When CONTINUUM_API_TOKEN is set, all API and WebSocket requests must
 * include a valid Authorization header. When unset, auth is disabled
 * (suitable for local development).
 */

const EXCLUDED_PATHS = ["/api/v1/health", "/login", "/"];

export function getApiToken(): string | undefined {
  return process.env.CONTINUUM_API_TOKEN;
}

export function isAuthEnabled(): boolean {
  return !!getApiToken();
}

export function validateToken(token: string): boolean {
  const apiToken = getApiToken();
  if (!apiToken) return true; // Auth disabled
  return token === apiToken;
}

/**
 * Express middleware that validates Bearer tokens on API routes.
 * Skips auth for health checks and static file serving.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip auth if not configured
  if (!isAuthEnabled()) {
    next();
    return;
  }

  // Skip auth for excluded paths and static files
  if (
    EXCLUDED_PATHS.some((p) => req.path === p) ||
    !req.path.startsWith("/api/")
  ) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorised",
      message: "Missing or invalid Authorization header. Use: Bearer <token>",
    });
    return;
  }

  const token = authHeader.slice(7);
  if (!validateToken(token)) {
    res.status(403).json({
      error: "Forbidden",
      message: "Invalid API token",
    });
    return;
  }

  next();
}

/**
 * Validates a WebSocket upgrade request's auth token.
 * Checks both the Authorization header and ?token= query param.
 */
export function validateWebSocketAuth(req: Request): {
  valid: boolean;
  error?: string;
} {
  if (!isAuthEnabled()) {
    return { valid: true };
  }

  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (validateToken(token)) {
      return { valid: true };
    }
    return { valid: false, error: "Invalid token" };
  }

  // Check query param as fallback (useful for browser WebSocket connections)
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const queryToken = url.searchParams.get("token");
  if (queryToken && validateToken(queryToken)) {
    return { valid: true };
  }

  return { valid: false, error: "Missing authentication" };
}
