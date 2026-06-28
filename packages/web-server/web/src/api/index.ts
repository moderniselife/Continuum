/**
 * Continuum Web IDE — API barrel export
 *
 * Re-exports everything from the API layer so consumers can
 * `import { ws, health, ChatMode } from "@/api"`.
 *
 * @module api/index
 */

export * from "./types";
export * from "./ws";
export * from "./rest";
