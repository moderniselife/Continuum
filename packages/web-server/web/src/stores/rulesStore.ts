/**
 * rulesStore — Global state for agent rules management.
 *
 * Manages the rules list, source-based grouping, and all CRUD mutations.
 */

import { create } from "zustand";
import {
  listRules,
  createRule as apiCreateRule,
  updateRule as apiUpdateRule,
  deleteRule as apiDeleteRule,
  toggleRule as apiToggleRule,
  type Rule,
  type RuleSource,
} from "@/api/rules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RulesState {
  /** All loaded rules. */
  rules: Rule[];
  /** Rules grouped by source for display. */
  rulesBySource: Record<RuleSource, Rule[]>;
  /** Whether the store is currently loading. */
  loading: boolean;
  /** Last error message, if any. */
  error: string | null;

  // -- Actions --
  loadRules: () => Promise<void>;
  createRule: (rule: Omit<Rule, "slug">) => Promise<void>;
  updateRule: (
    slug: string,
    updates: Partial<Omit<Rule, "slug">>,
  ) => Promise<void>;
  deleteRule: (slug: string) => Promise<void>;
  toggleRule: (slug: string, enabled: boolean) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group an array of rules by their source field. */
function groupBySource(rules: Rule[]): Record<RuleSource, Rule[]> {
  const groups: Record<RuleSource, Rule[]> = {
    workspace: [],
    global: [],
    colocated: [],
    "agent-file": [],
  };

  for (const rule of rules) {
    const bucket = groups[rule.source];
    if (bucket) {
      bucket.push(rule);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useRulesStore = create<RulesState>((set, get) => ({
  // -- Initial state --
  rules: [],
  rulesBySource: {
    workspace: [],
    global: [],
    colocated: [],
    "agent-file": [],
  },
  loading: false,
  error: null,

  // -- Load all rules --
  loadRules: async () => {
    set({ loading: true, error: null });
    try {
      const { rules } = await listRules();
      set({
        rules,
        rulesBySource: groupBySource(rules),
        loading: false,
      });
    } catch (err) {
      console.error("[rulesStore] Failed to load rules:", err);
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load rules",
      });
    }
  },

  // -- Create a new rule --
  createRule: async (rule) => {
    try {
      await apiCreateRule(rule);
      await get().loadRules();
    } catch (err) {
      console.error("[rulesStore] Failed to create rule:", err);
    }
  },

  // -- Update an existing rule --
  updateRule: async (slug, updates) => {
    try {
      await apiUpdateRule(slug, updates);
      await get().loadRules();
    } catch (err) {
      console.error("[rulesStore] Failed to update rule:", err);
    }
  },

  // -- Delete a rule --
  deleteRule: async (slug) => {
    try {
      await apiDeleteRule(slug);
      // Optimistic removal
      set((state) => {
        const rules = state.rules.filter((r) => r.slug !== slug);
        return { rules, rulesBySource: groupBySource(rules) };
      });
    } catch (err) {
      console.error("[rulesStore] Failed to delete rule:", err);
      // Reload on failure to sync state
      await get().loadRules();
    }
  },

  // -- Toggle a rule's enabled state --
  toggleRule: async (slug, enabled) => {
    // Optimistic update
    set((state) => {
      const rules = state.rules.map((r) =>
        r.slug === slug ? { ...r, enabled } : r,
      );
      return { rules, rulesBySource: groupBySource(rules) };
    });

    try {
      await apiToggleRule(slug, enabled);
    } catch (err) {
      console.error("[rulesStore] Failed to toggle rule:", err);
      // Revert on failure
      await get().loadRules();
    }
  },
}));
