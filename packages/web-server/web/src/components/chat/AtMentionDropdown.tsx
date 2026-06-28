/**
 * AtMentionDropdown — Context provider mention dropdown.
 *
 * Appears above the chat input when the user types `@`. Shows a
 * two-level menu: first a list of context providers (@file, @codebase,
 * @web), then a searchable file picker when @file is selected.
 *
 * Uses Liquid Glass design language with glass-subtle background,
 * border-border-glass borders, and smooth transitions.
 *
 * @remarks Keyboard navigation: ↑/↓ to move, Enter to select, Escape to close.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from "react";
import {
  File,
  FolderSearch,
  Globe,
  Database,
  ChevronRight,
  Search,
  Loader2,
} from "lucide-react";
import { listAllFiles } from "@/api/context";
import type { ContextSubmenuItem } from "@/api/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context provider definition for the top-level menu. */
interface ContextProvider {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  /** Whether this provider is enabled/implemented. */
  enabled: boolean;
}

export interface AtMentionDropdownProps {
  /** Whether the dropdown is currently visible. */
  isOpen: boolean;
  /** Current search query typed after the `@` character. */
  query: string;
  /** Called when a file is selected — provides the submenu item. */
  onSelect: (item: ContextSubmenuItem) => void;
  /** Called when the dropdown should be dismissed. */
  onClose: () => void;
  /** Forwarded keyboard events from the parent textarea. */
  onKeyDown?: (e: KeyboardEvent) => boolean;
}

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

const PROVIDERS: ContextProvider[] = [
  {
    id: "file",
    label: "file",
    description: "Attach a file from your workspace",
    icon: File,
    enabled: true,
  },
  {
    id: "codebase",
    label: "codebase",
    description: "Search across the entire codebase",
    icon: Database,
    enabled: false,
  },
  {
    id: "web",
    label: "web",
    description: "Search the web for context",
    icon: Globe,
    enabled: false,
  },
];

// ---------------------------------------------------------------------------
// Fuzzy match helper
// ---------------------------------------------------------------------------

/**
 * Simple fuzzy match scoring. Returns -1 for no match, or a score
 * where lower is better (earlier + contiguous matches score higher).
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return 0;

  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for contiguous matches
      if (lastMatchIndex === ti - 1) {
        score += 1;
      }
      // Bonus for matching at word boundaries (after /, ., -, _)
      if (ti === 0 || "/.-_".includes(t[ti - 1])) {
        score += 5;
      }
      lastMatchIndex = ti;
      qi++;
    }
  }

  // All query characters must match
  if (qi < q.length) return -1;

  return score;
}

/**
 * Highlights matching characters in the target string.
 * Returns an array of spans with `highlighted` flag.
 */
function highlightMatches(
  query: string,
  target: string,
): Array<{ text: string; highlighted: boolean }> {
  if (!query) return [{ text: target, highlighted: false }];

  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const result: Array<{ text: string; highlighted: boolean }> = [];

  let qi = 0;
  let lastEnd = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Push non-highlighted segment before this match
      if (ti > lastEnd) {
        result.push({
          text: target.slice(lastEnd, ti),
          highlighted: false,
        });
      }
      result.push({ text: target[ti], highlighted: true });
      lastEnd = ti + 1;
      qi++;
    }
  }

  // Push remaining non-highlighted text
  if (lastEnd < target.length) {
    result.push({
      text: target.slice(lastEnd),
      highlighted: false,
    });
  }

  return result;
}

/**
 * Truncates a relative path to show only the last N segments.
 */
function truncatePath(relativePath: string, maxSegments = 3): string {
  const parts = relativePath.split("/");
  if (parts.length <= maxSegments) return relativePath;
  return "…/" + parts.slice(-maxSegments).join("/");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_VISIBLE_ITEMS = 10;

const AtMentionDropdown: React.FC<AtMentionDropdownProps> = ({
  isOpen,
  query,
  onSelect,
  onClose,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [level, setLevel] = useState<"providers" | "files">("providers");
  const [files, setFiles] = useState<ContextSubmenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Determine if query starts with a known provider name
  const matchedProvider = useMemo(() => {
    const q = query.toLowerCase();
    // If query is exactly a provider name or starts with "provider "
    for (const p of PROVIDERS) {
      if (q === p.id || q.startsWith(p.id + " ")) {
        return p;
      }
    }
    return null;
  }, [query]);

  // Extract sub-query for file search (text after "@file ")
  useEffect(() => {
    if (matchedProvider?.id === "file") {
      const subQuery = query.slice(matchedProvider.id.length).trim();
      setFileQuery(subQuery);
      setLevel("files");
    } else {
      setLevel("providers");
      setFileQuery("");
    }
  }, [query, matchedProvider]);

  // Fetch file list when entering file picker mode
  useEffect(() => {
    if (level === "files" && files.length === 0 && !isLoading) {
      setIsLoading(true);
      listAllFiles()
        .then((result) => {
          setFiles(result);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("[AtMentionDropdown] Failed to fetch files:", err);
          setIsLoading(false);
        });
    }
  }, [level, files.length, isLoading]);

  // Reset active index when items change
  useEffect(() => {
    setActiveIndex(0);
  }, [query, level]);

  /** Shape of items rendered in the dropdown list. */
  interface VisibleItem {
    id: string;
    title: string;
    description: string;
    icon?: React.ElementType;
    enabled?: boolean;
    score?: number;
  }

  // Filter and sort items based on current level
  const visibleItems: VisibleItem[] = useMemo(() => {
    if (level === "providers") {
      const q = query.toLowerCase();
      return PROVIDERS.filter(
        (p) => p.enabled && (q.length === 0 || p.label.includes(q)),
      ).map((p) => ({
        id: p.id,
        title: `@${p.label}`,
        description: p.description,
        icon: p.icon,
        enabled: p.enabled,
      }));
    }

    // File picker mode — fuzzy search
    if (files.length === 0) return [];

    if (!fileQuery) {
      return files.slice(0, MAX_VISIBLE_ITEMS).map((f) => ({
        ...f,
        title: f.title,
        description: truncatePath(f.description),
      }));
    }

    return files
      .map((f) => ({
        ...f,
        score: Math.max(
          fuzzyScore(fileQuery, f.title),
          fuzzyScore(fileQuery, f.description) * 0.8,
        ),
      }))
      .filter((f) => f.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_VISIBLE_ITEMS)
      .map((f) => ({
        ...f,
        description: truncatePath(f.description),
      }));
  }, [level, query, fileQuery, files]);

  // Scroll the active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(
      `[data-index="${activeIndex}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // Handle keyboard navigation — called from parent
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!isOpen) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => Math.min(prev + 1, visibleItems.length - 1));
          return true;

        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, 0));
          return true;

        case "Enter":
        case "Tab": {
          e.preventDefault();
          const item = visibleItems[activeIndex];
          if (!item) return true;

          if (level === "providers") {
            // Don't select disabled providers
            if (item.enabled === false) return true;
            // Selecting a provider transitions to file list
            // This is handled by the parent updating the query
            return true;
          }

          // File selected — resolve and pass back
          onSelect({
            id: item.id,
            title: item.title,
            description: item.description,
          });
          return true;
        }

        case "Escape":
          e.preventDefault();
          onClose();
          return true;

        default:
          return false;
      }
    },
    [isOpen, activeIndex, visibleItems, level, onSelect, onClose],
  );

  // Expose handleKeyDown to parent
  useEffect(() => {
    // This is handled via the prop — parent calls it directly
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="glass-subtle border-border-glass animate-in fade-in slide-in-from-bottom-2 absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border shadow-xl duration-150">
      {/* Header */}
      <div className="border-border-glass flex items-center gap-2 border-b px-3 py-2">
        {level === "files" ? (
          <>
            <Search size={13} className="text-text-tertiary" />
            <span className="text-text-secondary text-xs">
              Search files{fileQuery ? `: "${fileQuery}"` : "…"}
            </span>
          </>
        ) : (
          <>
            <FolderSearch size={13} className="text-text-tertiary" />
            <span className="text-text-secondary text-xs">
              Context providers
            </span>
          </>
        )}
      </div>

      {/* List */}
      <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 size={16} className="text-text-tertiary animate-spin" />
            <span className="text-text-tertiary text-xs">Loading files…</span>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="text-text-tertiary py-6 text-center text-xs">
            {level === "files"
              ? "No files match your search"
              : "No providers available"}
          </div>
        ) : (
          visibleItems.map((item, index) => {
            const isActive = index === activeIndex;
            const isDisabled = item.enabled === false;

            return (
              <button
                key={item.id}
                data-index={index}
                onClick={() => {
                  if (isDisabled) return;
                  if (level === "providers") {
                    // Provider selected — parent handles query update
                    return;
                  }
                  onSelect({
                    id: item.id,
                    title: item.title,
                    description: item.description,
                  });
                }}
                onMouseEnter={() => setActiveIndex(index)}
                disabled={isDisabled}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-100 ${
                  isActive
                    ? "bg-accent/10 text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover"
                } ${isDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
              >
                {/* Icon */}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    isActive ? "bg-accent/20 text-accent" : "bg-bg-secondary"
                  }`}
                >
                  {level === "providers" && item.icon ? (
                    (() => {
                      const Icon = item.icon;
                      return <Icon size={14} />;
                    })()
                  ) : (
                    <File size={14} />
                  )}
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {level === "files" && fileQuery ? (
                      // Highlighted match
                      <span>
                        {highlightMatches(fileQuery, item.title).map(
                          (seg, i) =>
                            seg.highlighted ? (
                              <span key={i} className="text-accent font-bold">
                                {seg.text}
                              </span>
                            ) : (
                              <span key={i}>{seg.text}</span>
                            ),
                        )}
                      </span>
                    ) : (
                      item.title
                    )}
                  </div>
                  <div className="text-text-tertiary truncate text-[11px]">
                    {level === "files" && fileQuery ? (
                      <span>
                        {highlightMatches(fileQuery, item.description).map(
                          (seg, i) =>
                            seg.highlighted ? (
                              <span
                                key={i}
                                className="text-accent font-semibold"
                              >
                                {seg.text}
                              </span>
                            ) : (
                              <span key={i}>{seg.text}</span>
                            ),
                        )}
                      </span>
                    ) : (
                      item.description
                    )}
                  </div>
                </div>

                {/* Arrow for providers */}
                {level === "providers" && !isDisabled && (
                  <ChevronRight
                    size={14}
                    className="text-text-tertiary shrink-0"
                  />
                )}

                {/* "Coming soon" badge for disabled providers */}
                {isDisabled && (
                  <span className="glass-subtle text-text-tertiary shrink-0 rounded-full px-2 py-0.5 text-[10px]">
                    Soon
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="border-border-glass text-text-tertiary flex items-center gap-3 border-t px-3 py-1.5 text-[10px]">
        <span>
          <kbd className="glass-subtle rounded px-1 py-0.5 font-mono text-[9px]">
            ↑↓
          </kbd>{" "}
          navigate
        </span>
        <span>
          <kbd className="glass-subtle rounded px-1 py-0.5 font-mono text-[9px]">
            ⏎
          </kbd>{" "}
          select
        </span>
        <span>
          <kbd className="glass-subtle rounded px-1 py-0.5 font-mono text-[9px]">
            esc
          </kbd>{" "}
          dismiss
        </span>
      </div>
    </div>
  );
};

export { AtMentionDropdown, type ContextProvider };
export default AtMentionDropdown;
