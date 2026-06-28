/**
 * SearchPanel — Sidebar panel for full-text search across workspace files.
 *
 * Features:
 *   - Text query input with case-sensitive and regex toggles
 *   - Include/exclude glob filters
 *   - Collapsible replace section with single-match and replace-all support
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
  Replace,
  ReplaceAll,
} from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import {
  searchFiles,
  replaceInFile,
  replaceAll,
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
  showReplace: boolean;
  onReplace?: (match: SearchMatch) => void;
  isReplacing?: boolean;
}

function MatchLine({
  match,
  query,
  onOpen,
  showReplace,
  onReplace,
  isReplacing,
}: MatchLineProps) {
  // Highlight the matching portion of the content
  const before = match.content.slice(0, match.matchStart);
  const matched = match.content.slice(match.matchStart, match.matchEnd);
  const after = match.content.slice(match.matchEnd);

  return (
    <div className="group flex w-full items-center gap-0.5">
      <button
        type="button"
        onClick={() => onOpen(match.file, match.line)}
        className="hover:bg-bg-hover flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-0.5 text-left transition-colors"
      >
        <span className="text-text-tertiary w-8 shrink-0 text-right font-mono text-[10px] leading-5">
          {match.line}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-5">
          <span className="text-text-secondary">{before}</span>
          <span
            className={`rounded-sm px-0.5 font-semibold ${
              showReplace
                ? "bg-red-500/20 text-red-400 line-through"
                : "bg-accent/20 text-accent"
            }`}
          >
            {matched}
          </span>
          <span className="text-text-secondary">{after}</span>
        </span>
      </button>

      {/* Single replace button — visible on hover or when replace mode is active */}
      {showReplace && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReplace?.(match);
          }}
          disabled={isReplacing}
          className="text-text-tertiary hover:text-accent hover:bg-accent/10 shrink-0 rounded p-0.5 opacity-0 transition-all disabled:opacity-50 group-hover:opacity-100"
          title="Replace this match"
          aria-label="Replace this match"
        >
          <Replace size={12} />
        </button>
      )}
    </div>
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
  showReplace: boolean;
  onReplace?: (match: SearchMatch) => void;
  replacingMatch?: SearchMatch | null;
}

function FileGroup({
  group,
  query,
  onOpen,
  defaultExpanded = true,
  showReplace,
  onReplace,
  replacingMatch,
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
              showReplace={showReplace}
              onReplace={onReplace}
              isReplacing={
                replacingMatch?.file === match.file &&
                replacingMatch?.line === match.line
              }
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

  // Replace state
  const [showReplace, setShowReplace] = useState(false);
  const [replaceText, setReplaceText] = useState("");
  const [isReplacing, setIsReplacing] = useState(false);
  const [replacingMatch, setReplacingMatch] = useState<SearchMatch | null>(
    null,
  );
  const [replaceMessage, setReplaceMessage] = useState<string | null>(null);

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
   * Handle replacing a single match.
   */
  const handleReplaceSingle = useCallback(
    async (match: SearchMatch) => {
      if (!replaceText && replaceText !== "") return;

      setReplacingMatch(match);
      setIsReplacing(true);
      setReplaceMessage(null);

      try {
        const response = await replaceInFile({
          filePath: match.file,
          line: match.line,
          searchText: query.trim(),
          replaceText,
          caseSensitive,
          regex: useRegex,
        });

        if (response.replaced) {
          setReplaceMessage("Replaced 1 match");
          // Re-run search to refresh results
          void executeSearch(query);
        } else {
          setReplaceMessage("Match not found — it may have already changed");
        }
      } catch (err) {
        setReplaceMessage(`Replace failed: ${(err as Error).message}`);
      } finally {
        setIsReplacing(false);
        setReplacingMatch(null);

        // Clear message after a few seconds
        setTimeout(() => setReplaceMessage(null), 4000);
      }
    },
    [replaceText, query, caseSensitive, useRegex, executeSearch],
  );

  /**
   * Handle replacing all matches across all files.
   */
  const handleReplaceAll = useCallback(async () => {
    if (!query.trim()) return;

    setIsReplacing(true);
    setReplaceMessage(null);

    try {
      const response = await replaceAll({
        searchText: query.trim(),
        replaceText,
        caseSensitive,
        regex: useRegex,
        include: includeGlob || undefined,
        exclude: excludeGlob || undefined,
      });

      setReplaceMessage(
        `Replaced ${response.replacementsCount} match${response.replacementsCount !== 1 ? "es" : ""} across ${response.filesModified} file${response.filesModified !== 1 ? "s" : ""}`,
      );

      // Re-run search to refresh results
      void executeSearch(query);
    } catch (err) {
      setReplaceMessage(`Replace all failed: ${(err as Error).message}`);
    } finally {
      setIsReplacing(false);

      // Clear message after a few seconds
      setTimeout(() => setReplaceMessage(null), 5000);
    }
  }, [
    query,
    replaceText,
    caseSensitive,
    useRegex,
    includeGlob,
    excludeGlob,
    executeSearch,
  ]);

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

  /**
   * Handle Enter key in replace input — triggers replace-all.
   */
  const handleReplaceKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && e.ctrlKey) {
        void handleReplaceAll();
      }
    },
    [handleReplaceAll],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border-glass flex items-center gap-2 border-b px-3 py-2.5">
        <Search size={14} className="text-accent shrink-0" />
        <span className="text-text-primary text-xs font-semibold tracking-wide">
          Search
        </span>

        {/* Replace All button — visible when replace mode is active and there are results */}
        {showReplace && results && results.totalMatches > 0 && (
          <button
            type="button"
            onClick={handleReplaceAll}
            disabled={isReplacing}
            className="text-text-tertiary hover:text-accent hover:bg-accent/10 ml-auto rounded p-1 transition-colors disabled:opacity-50"
            title="Replace all matches across all files (Ctrl+Enter)"
            aria-label="Replace all matches"
          >
            <ReplaceAll size={14} />
          </button>
        )}

        {results && (
          <span
            className={`text-text-tertiary text-[10px] ${!(showReplace && results.totalMatches > 0) ? "ml-auto" : ""}`}
          >
            {results.totalMatches} result
            {results.totalMatches !== 1 ? "s" : ""}
            {results.truncated ? " (truncated)" : ""}
          </span>
        )}
      </div>

      {/* Search & Replace inputs */}
      <div className="space-y-1.5 px-3 py-2">
        <div className="flex items-start gap-1.5">
          {/* Toggle replace mode button */}
          <button
            type="button"
            onClick={() => setShowReplace(!showReplace)}
            className={`mt-1.5 shrink-0 rounded p-0.5 transition-colors ${
              showReplace
                ? "bg-accent/20 text-accent"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
            title={showReplace ? "Hide replace" : "Show replace"}
            aria-label="Toggle replace mode"
          >
            <ChevronDown
              size={12}
              className={`transition-transform ${showReplace ? "" : "-rotate-90"}`}
            />
          </button>

          <div className="min-w-0 flex-1 space-y-1">
            {/* Search input */}
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

            {/* Replace input — collapsible */}
            {showReplace && (
              <div className="animate-fade-in bg-bg-input border-border flex items-center gap-1 rounded-lg border px-2.5 py-1.5">
                <Replace size={12} className="text-text-tertiary shrink-0" />
                <input
                  type="text"
                  placeholder="Replace with…"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  onKeyDown={handleReplaceKeyDown}
                  className="text-text-primary placeholder:text-text-tertiary flex-1 bg-transparent text-xs outline-none"
                />
                {replaceText && (
                  <button
                    type="button"
                    onClick={() => setReplaceText("")}
                    className="text-text-tertiary hover:text-text-secondary"
                  >
                    <X size={12} />
                  </button>
                )}

                {/* Replace All inline button */}
                <div className="border-border flex items-center gap-0.5 border-l pl-1.5">
                  <button
                    type="button"
                    onClick={handleReplaceAll}
                    disabled={isReplacing || !query.trim()}
                    className="text-text-tertiary hover:text-accent hover:bg-accent/10 rounded p-0.5 transition-colors disabled:opacity-50"
                    title="Replace all (Ctrl+Enter)"
                    aria-label="Replace all matches"
                  >
                    <ReplaceAll size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Replace confirmation message */}
        {replaceMessage && (
          <div className="animate-fade-in bg-accent/10 text-accent rounded-md px-2.5 py-1.5 text-[11px]">
            {replaceMessage}
          </div>
        )}

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
                showReplace={showReplace}
                onReplace={handleReplaceSingle}
                replacingMatch={replacingMatch}
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
