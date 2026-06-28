/**
 * skillsStore — Global state for agent skills management.
 *
 * Manages the skills list, active skill detail view, and all CRUD mutations.
 */

import { create } from "zustand";
import {
  listSkills,
  getSkill,
  createSkill as apiCreateSkill,
  updateSkill as apiUpdateSkill,
  deleteSkill as apiDeleteSkill,
  type Skill,
} from "@/api/skills";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillsState {
  /** All loaded skills (summary level). */
  skills: Skill[];
  /** Currently selected skill with full detail (content loaded). */
  activeSkill: Skill | null;
  /** Whether the store is currently loading. */
  loading: boolean;
  /** Whether a detail fetch is in progress. */
  loadingDetail: boolean;
  /** Last error message, if any. */
  error: string | null;

  // -- Actions --
  loadSkills: () => Promise<void>;
  selectSkill: (skillPath: string) => Promise<void>;
  clearActiveSkill: () => void;
  createSkill: (
    skill: Pick<Skill, "name" | "description" | "source" | "content">,
  ) => Promise<void>;
  updateSkill: (
    skillPath: string,
    updates: Partial<Pick<Skill, "name" | "description" | "content">>,
  ) => Promise<void>;
  deleteSkill: (skillPath: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSkillsStore = create<SkillsState>((set, get) => ({
  // -- Initial state --
  skills: [],
  activeSkill: null,
  loading: false,
  loadingDetail: false,
  error: null,

  // -- Load all skills --
  loadSkills: async () => {
    set({ loading: true, error: null });
    try {
      const { skills } = await listSkills();
      set({ skills, loading: false });
    } catch (err) {
      console.error("[skillsStore] Failed to load skills:", err);
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load skills",
      });
    }
  },

  // -- Select a skill and load full detail --
  selectSkill: async (skillPath: string) => {
    set({ loadingDetail: true });
    try {
      const { skill } = await getSkill(skillPath);
      set({ activeSkill: skill, loadingDetail: false });
    } catch (err) {
      console.error("[skillsStore] Failed to load skill detail:", err);
      set({ loadingDetail: false });
    }
  },

  // -- Clear the active skill --
  clearActiveSkill: () => {
    set({ activeSkill: null });
  },

  // -- Create a new skill --
  createSkill: async (skill) => {
    try {
      await apiCreateSkill(skill);
      await get().loadSkills();
    } catch (err) {
      console.error("[skillsStore] Failed to create skill:", err);
    }
  },

  // -- Update an existing skill --
  updateSkill: async (skillPath, updates) => {
    try {
      await apiUpdateSkill(skillPath, updates);
      await get().loadSkills();
      // Refresh detail if this was the active skill
      const active = get().activeSkill;
      if (active && active.path === skillPath) {
        await get().selectSkill(skillPath);
      }
    } catch (err) {
      console.error("[skillsStore] Failed to update skill:", err);
    }
  },

  // -- Delete a skill --
  deleteSkill: async (skillPath) => {
    try {
      await apiDeleteSkill(skillPath);
      // Clear active if it was the deleted one
      const active = get().activeSkill;
      if (active && active.path === skillPath) {
        set({ activeSkill: null });
      }
      // Optimistic removal
      set((state) => ({
        skills: state.skills.filter((s) => s.path !== skillPath),
      }));
    } catch (err) {
      console.error("[skillsStore] Failed to delete skill:", err);
      await get().loadSkills();
    }
  },
}));
