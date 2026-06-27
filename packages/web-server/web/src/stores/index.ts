/**
 * Continuum Web IDE — Stores barrel export
 *
 * Re-exports all Zustand stores for convenient single-path imports:
 * `import { useChatStore, useConnectionStore } from "@/stores"`.
 *
 * @module stores/index
 */

export { useConnectionStore } from "./connectionStore";
export type { ConnectionState } from "./connectionStore";

export { useConfigStore } from "./configStore";
export type { ConfigState } from "./configStore";

export { useSessionStore, groupSessionsByDate } from "./sessionStore";
export type { SessionState, DateGroup } from "./sessionStore";

export { useChatStore } from "./chatStore";
export type { ChatState } from "./chatStore";
