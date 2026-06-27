/**
 * Continuum Web IDE — Config Store
 *
 * Manages the list of available LLM models and the user's currently
 * selected model. Persists the selection in localStorage so it survives
 * page refreshes.
 *
 * @module stores/configStore
 */

import { create } from "zustand";
import type { ModelInfo } from "@/api/types";
import { getModels } from "@/api/rest";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** LocalStorage key for persisting the selected model ID. */
const SELECTED_MODEL_KEY = "continuum_selected_model";

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface ConfigState {
  /** Available LLM models reported by the server. */
  models: ModelInfo[];
  /** Currently selected model ID — `null` until models are loaded. */
  selectedModelId: string | null;
  /** `true` while models are being fetched. */
  isLoading: boolean;
  /** Error message from the most recent load attempt. */
  error: string | null;

  // -- Actions --------------------------------------------------------------
  /** Fetch the model list from the server. */
  loadModels: () => Promise<void>;
  /** Change the active model (persisted to localStorage). */
  setSelectedModel: (modelId: string) => void;
  /** Convenience getter — resolves the full `ModelInfo` for the selected ID. */
  getSelectedModel: () => ModelInfo | null;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useConfigStore = create<ConfigState>((set, get) => ({
  models: [],
  selectedModelId: readPersistedModelId(),
  isLoading: false,
  error: null,

  loadModels: async () => {
    set({ isLoading: true, error: null });

    try {
      const models = await getModels();
      const currentSelection = get().selectedModelId;

      // Validate persisted selection — if the model no longer exists on the
      // server, fall back to the first available model.
      const isValid =
        currentSelection !== null &&
        models.some((m) => m.id === currentSelection);

      const selectedModelId = isValid
        ? currentSelection
        : models.length > 0
          ? models[0].id
          : null;

      set({ models, selectedModelId, isLoading: false });

      // Persist the (possibly corrected) selection.
      if (selectedModelId) {
        persistModelId(selectedModelId);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load models";
      set({ error: message, isLoading: false });
      console.error("[configStore] loadModels error:", err);
    }
  },

  setSelectedModel: (modelId: string) => {
    const { models } = get();
    const exists = models.some((m) => m.id === modelId);

    if (!exists) {
      console.warn(
        `[configStore] Attempted to select unknown model "${modelId}".`,
      );
      return;
    }

    set({ selectedModelId: modelId });
    persistModelId(modelId);
  },

  getSelectedModel: () => {
    const { models, selectedModelId } = get();
    if (!selectedModelId) return null;
    return models.find((m) => m.id === selectedModelId) ?? null;
  },
}));

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function readPersistedModelId(): string | null {
  try {
    return localStorage.getItem(SELECTED_MODEL_KEY);
  } catch {
    return null;
  }
}

function persistModelId(modelId: string): void {
  try {
    localStorage.setItem(SELECTED_MODEL_KEY, modelId);
  } catch {
    // LocalStorage may be unavailable — silently skip.
  }
}
