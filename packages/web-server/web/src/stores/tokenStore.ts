/**
 * tokenStore — Global state for tracking token usage and estimated costs.
 *
 * Provides real-time token counting and cost estimation based on
 * hardcoded model pricing. Other components report token usage via
 * `addTokens()`.
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Model pricing (per 1M tokens)
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/** Hardcoded pricing per model (USD per 1M tokens). */
const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "claude-3.5-sonnet": { inputPer1M: 3, outputPer1M: 15 },
  "claude-4-sonnet": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3-haiku": { inputPer1M: 0.25, outputPer1M: 1.25 },
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "deepseek-v3": { inputPer1M: 0.27, outputPer1M: 1.1 },
};

/** Default pricing for unknown / local models. */
const DEFAULT_PRICING: ModelPricing = { inputPer1M: 0, outputPer1M: 0 };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenState {
  /** Total input tokens consumed this session. */
  inputTokens: number;
  /** Total output tokens consumed this session. */
  outputTokens: number;
  /** Total tokens (input + output). */
  totalTokens: number;
  /** Estimated session cost in USD. */
  estimatedCost: number;
  /** Currently active model name (for pricing lookup). */
  modelName: string;

  // -- Actions --
  /** Report token usage from an API call. */
  addTokens: (input: number, output: number) => void;
  /** Set the active model for pricing calculations. */
  setModel: (modelName: string) => void;
  /** Reset all counters to zero. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Calculate the estimated cost for given token counts and model. */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  modelName: string,
): number {
  const pricing = findPricing(modelName);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}

/** Find pricing for a model — tries exact match, then partial match. */
function findPricing(modelName: string): ModelPricing {
  const lower = modelName.toLowerCase();

  // Exact match first
  if (MODEL_PRICING[lower]) {
    return MODEL_PRICING[lower];
  }

  // Partial match (e.g. "gpt-4o-2024-08-06" → "gpt-4o")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (lower.includes(key)) {
      return pricing;
    }
  }

  return DEFAULT_PRICING;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTokenStore = create<TokenState>((set, get) => ({
  // -- Initial state --
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedCost: 0,
  modelName: "",

  // -- Report token usage --
  addTokens: (input, output) => {
    const state = get();
    const newInput = state.inputTokens + input;
    const newOutput = state.outputTokens + output;
    const newTotal = newInput + newOutput;
    const newCost = calculateCost(newInput, newOutput, state.modelName);

    set({
      inputTokens: newInput,
      outputTokens: newOutput,
      totalTokens: newTotal,
      estimatedCost: newCost,
    });
  },

  // -- Set active model --
  setModel: (modelName) => {
    const state = get();
    const newCost = calculateCost(
      state.inputTokens,
      state.outputTokens,
      modelName,
    );
    set({ modelName, estimatedCost: newCost });
  },

  // -- Reset counters --
  reset: () => {
    set({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    });
  },
}));
