/**
 * SearchPanel — Sidebar panel for full-text search across workspace files.
 *
 * Features:
 *   - Text query input with case-sensitive and regex toggles
 *   - Include/exclude glob filters
 *   - Results grouped by file with match highlighting
 *   - Click-to-open file at matching line
 *   - Result count and truncation indicator
 *
 * Liquid Glass design language. Connects to the search API and fileStore.
 *
 * @module components/search/SearchPanel
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  CaseSensitive,
  Regex,
  Filter,
  FileText,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import {
  searchFiles,
  type SearchMatch,
  type SearchResponse,
} from "@/api/search";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GroupedResults {
  file: string;
  /** Display name (basename) */
  displayName: string;
  /** Relative path for display */
  relativePath: string;
  matches: SearchMatch[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Group flat search matches by file path.
 */
function groupByFile(
  matches: SearchMatch[],
  workspaceDirs: string[],
): GroupedResults[] {
  const groups = new Map<string, SearchMatch[]>();

  for (const match of matches) {
    const existing = groups.get(match.file);
    if (existing) {
      existing.push(match);
    } else {
      groups.set(match.file, [match]);
    }
  }

  return Array.from(groups.entries()).map(([file, fileMatches]) => {
    const segments = file.split("/");
    const displayName = segments[segments.length - 1] || file;

    // Build relative path by stripping workspace dir prefix
    let relativePath = file;
    for (const dir of workspaceDirs) {
      if (file.startsWith(dir + "/")) {
        relativePath = file.slice(dir.length + 1);
        break;
      }
      if (file.startsWith(dir)) {
        relativePath = file.slice(dir.length);
        break;
      }
    }

    return { file, displayName, relativePath, matches: fileMatches };
  });
}

// ---------------------------------------------------------------------------
// MatchLine — Single search result line
// ---------------------------------------------------------------------------

interface MatchLineProps {
  match: SearchMatch;
  query: string;
  onOpen: (file: string, line: number) => void;
}

function MatchLine({ match, query, onOpen }: MatchLineProps) {
  // Highlight the matching portion of the content
  const before = match.content.slice(0, match.matchStart);
  const matched = match.content.slice(match.matchStart, match.matchEnd);
  const after = match.content.slice(match.matchEnd);

  return (
    <button
      type="button"
      onClick={() => onOpen(match.file, match.line)}
      className="hover:bg-bg-hover group flex w-full items-start gap-2 rounded px-2 py-0.5 text-left transition-colors"
    >
      <span className="text-text-tertiary w-8 shrink-0 text-right font-mono text-[10px] leading-5">
        {match.line}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-5">
        <span className="text-text-secondary">{before}</span>
        <span className="bg-accent/20 text-accent rounded-sm px-0.5 font-semibold">
          {matched}
        </span>
        <span className="text-text-secondary">{after}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// FileGroup — Collapsible group of matches for a single file
// ---------------------------------------------------------------------------

interface FileGroupProps {
  group: GroupedResults;
  query: string;
  onOpen: (file: string, line: number) => void;
  defaultExpanded?: boolean;
}

function FileGroup({
  group,
  query,
  onOpen,
  defaultExpanded = true,
}: FileGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="hover:bg-bg-hover flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-text-tertiary shrink-0" />
        )}
        <FileText size={12} className="text-accent shrink-0" />
        <span className="text-text-primary min-w-0 flex-1 truncate text-xs font-medium">
          {group.displayName}
        </span>
        <span className="text-text-tertiary ml-auto shrink-0 text-[10px]">
          {group.matches.length}
        </span>
      </button>

      {/* Relative path hint */}
      {expanded && (
        <div className="text-text-tertiary mb-0.5 truncate pl-8 text-[10px]">
          {group.relativePath}
        </div>
      )}

      {/* Match lines */}
      {expanded && (
        <div className="ml-4 flex flex-col">
          {group.matches.map((match, idx) => (
            <MatchLine
              key={`${match.line}-${idx}`}
              match={match}
              query={query}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchPanel (exported)
// ---------------------------------------------------------------------------

function SearchPanel() {
  const openFile = useFileStore((s) => s.openFile);
  const workspaceDirs = useFileStore((s) => s.workspaceDirs);

  // Search state
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [includeGlob, setIncludeGlob] = useState("");
  const [excludeGlob, setExcludeGlob] = useState("");

  // Results state
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group results by file
  const groupedResults = useMemo(() => {
    if (!results?.results.length) return [];
    return groupByFile(results.results, workspaceDirs);
  }, [results, workspaceDirs]);

  /**
   * Execute the search query.
   */
  const executeSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults(null);
        setError(null);
        return;
      }

      setIsSearching(true);
      setError(null);

      try {
        const response = await searchFiles({
          q: searchQuery.trim(),
          caseSensitive,
          regex: useRegex,
          include: includeGlob || undefined,
          exclude: excludeGlob || undefined,
        });

        setResults(response);
      } catch (err) {
        setError((err as Error).message);
        setResults(null);
      } finally {
        setIsSearching(false);
      }
    },
    [caseSensitive, useRegex, includeGlob, excludeGlob],
  );

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void executeSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, executeSearch]);

  /**
   * Handle clicking a search result — opens the file in the editor.
   */
  const handleOpenResult = useCallback(
    async (file: string, _line: number) => {
      try {
        await openFile(file);
        // TODO: Scroll to line once editor supports it
      } catch (err) {
        console.error("Failed to open file from search result:", err);
      }
    },
    [openFile],
  );

  /**
   * Handle Enter key in search input.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void executeSearch(query);
      }
    },
    [query, executeSearch],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border-glass flex items-center gap-2 border-b px-3 py-2.5">
        <Search size={14} className="text-accent shrink-0" />
        <span className="text-text-primary text-xs font-semibold tracking-wide">
          Search
        </span>
        {results && (
          <span className="text-text-tertiary ml-auto text-[10px]">
            {results.totalMatches} result
            {results.totalMatches !== 1 ? "s" : ""}
            {results.truncated ? " (truncated)" : ""}
          </span>
        )}
      </div>

      {/* Search input */}
      <div className="space-y-1.5 px-3 py-2">
        <div className="bg-bg-input border-border flex items-center gap-1 rounded-lg border px-2.5 py-1.5">
          <Search size={12} className="text-text-tertiary shrink-0" />
          <input
            type="text"
            placeholder="Search files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-text-primary placeholder:text-text-tertiary flex-1 bg-transparent text-xs outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults(null);
              }}
              className="text-text-tertiary hover:text-text-secondary"
            >
              <X size={12} />
            </button>
          )}

          {/* Toggle buttons */}
          <div className="border-border flex items-center gap-0.5 border-l pl-1.5">
            <button
              type="button"
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={`rounded p-0.5 transition-colors ${
                caseSensitive
                  ? "bg-accent/20 text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
              title="Match case"
              aria-label="Toggle case sensitivity"
            >
              <CaseSensitive size={14} />
            </button>
            <button
              type="button"
              onClick={() => setUseRegex(!useRegex)}
              className={`rounded p-0.5 transition-colors ${
                useRegex
                  ? "bg-accent/20 text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
              title="Use regular expression"
              aria-label="Toggle regex mode"
            >
              <Regex size={14} />
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`rounded p-0.5 transition-colors ${
                showFilters || includeGlob || excludeGlob
                  ? "bg-accent/20 text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
              title="File filters"
              aria-label="Toggle file filters"
            >
              <Filter size={14} />
            </button>
          </div>
        </div>

        {/* Glob filters */}
        {showFilters && (
          <div className="animate-fade-in space-y-1">
            <div className="bg-bg-input border-border flex items-center gap-1.5 rounded-lg border px-2.5 py-1">
              <span className="text-text-tertiary text-[10px] font-medium">
                Include
              </span>
              <input
                type="text"
                placeholder="e.g. *.ts, src/**"
                value={includeGlob}
                onChange={(e) => setIncludeGlob(e.target.value)}
                className="text-text-primary placeholder:text-text-tertiary flex-1 bg-transparent text-[11px] outline-none"
              />
            </div>
            <div className="bg-bg-input border-border flex items-center gap-1.5 rounded-lg border px-2.5 py-1">
              <span className="text-text-tertiary text-[10px] font-medium">
                Exclude
              </span>
              <input
                type="text"
                placeholder="e.g. node_modules, dist"
                value={excludeGlob}
                onChange={(e) => setExcludeGlob(e.target.value)}
                className="text-text-primary placeholder:text-text-tertiary flex-1 bg-transparent text-[11px] outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isSearching ? (
          <div className="text-text-tertiary flex items-center justify-center gap-2 py-8 text-xs">
            <Loader2 size={14} className="animate-spin" />
            Searching…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-xs text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void executeSearch(query)}
              className="text-accent text-xs hover:underline"
            >
              Retry
            </button>
          </div>
        ) : groupedResults.length > 0 ? (
          <div className="flex flex-col gap-1">
            {groupedResults.map((group) => (
              <FileGroup
                key={group.file}
                group={group}
                query={query}
                onOpen={handleOpenResult}
              />
            ))}
          </div>
        ) : query && results ? (
          <div className="text-text-tertiary flex flex-col items-center gap-2 py-8 text-center text-xs">
            <Search size={24} className="opacity-30" />
            <p>No results found for &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <div className="text-text-tertiary flex flex-col items-center gap-2 py-8 text-center text-xs">
            <Search size={24} className="opacity-30" />
            <p>Enter a search query to find text across your workspace</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchPanel;
