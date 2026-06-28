/**
 * GitPanel — Sidebar panel for git source control operations.
 *
 * Features:
 *   - Current branch display
 *   - Changed files list (staged, modified, untracked)
 *   - Stage/unstage individual files or all
 *   - Commit with message input
 *   - Recent commit log (last 20 commits)
 *
 * Liquid Glass design language. Connects to the git API endpoints.
 *
 * @module components/git/GitPanel
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GitBranch,
  GitCommit as GitCommitIcon,
  GitFork,
  Plus,
  Minus,
  FileText,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Check,
  Loader2,
  Clock,
  CircleDot,
  FileQuestion,
  FilePlus,
  FileMinus,
  ArrowRightLeft,
  Upload,
} from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import {
  getGitStatus,
  getGitLog,
  stageFiles,
  unstageFiles,
  createCommit,
  listSubmodules,
  getSubmoduleStatus,
  commitSubmodule,
  updateSubmoduleRefs,
  type GitStatusFile,
  type GitCommit,
  type GitSubmodule,
  type GitSubmoduleDetailResponse,
} from "@/api/git";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the appropriate icon for a file status.
 */
function StatusIcon({
  status,
  className = "",
}: {
  status: GitStatusFile["status"];
  className?: string;
}) {
  const iconSize = 12;
  switch (status) {
    case "modified":
      return (
        <CircleDot size={iconSize} className={`text-amber-400 ${className}`} />
      );
    case "added":
      return (
        <FilePlus size={iconSize} className={`text-green-400 ${className}`} />
      );
    case "deleted":
      return (
        <FileMinus size={iconSize} className={`text-red-400 ${className}`} />
      );
    case "untracked":
      return (
        <FileQuestion
          size={iconSize}
          className={`text-text-tertiary ${className}`}
        />
      );
    case "renamed":
      return (
        <ArrowRightLeft
          size={iconSize}
          className={`text-blue-400 ${className}`}
        />
      );
    default:
      return (
        <FileText
          size={iconSize}
          className={`text-text-tertiary ${className}`}
        />
      );
  }
}

/**
 * Get the display label for a file status.
 */
function statusLabel(status: GitStatusFile["status"]): string {
  switch (status) {
    case "modified":
      return "M";
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "untracked":
      return "U";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    default:
      return "?";
  }
}

// ---------------------------------------------------------------------------
// FileChangeItem — Single changed file row
// ---------------------------------------------------------------------------

interface FileChangeItemProps {
  file: GitStatusFile;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onOpen: (path: string) => void;
}

function FileChangeItem({
  file,
  onStage,
  onUnstage,
  onOpen,
}: FileChangeItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const basename = file.path.split("/").pop() ?? file.path;
  const dirPath = file.path.includes("/")
    ? file.path.slice(0, file.path.lastIndexOf("/"))
    : "";

  return (
    <div
      className="hover:bg-bg-hover group flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <StatusIcon status={file.status} className="shrink-0" />

      <button
        type="button"
        onClick={() => onOpen(file.path)}
        className="text-text-primary flex min-w-0 flex-1 items-baseline gap-1 text-left text-xs"
      >
        <span className="truncate font-medium">{basename}</span>
        {dirPath && (
          <span className="text-text-tertiary truncate text-[10px]">
            {dirPath}
          </span>
        )}
      </button>

      {/* Stage/unstage button */}
      {isHovered && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (file.staged) {
              onUnstage(file.path);
            } else {
              onStage(file.path);
            }
          }}
          className="text-text-tertiary hover:text-text-primary shrink-0 rounded p-0.5 transition-colors"
          title={file.staged ? "Unstage file" : "Stage file"}
          aria-label={
            file.staged ? `Unstage ${file.path}` : `Stage ${file.path}`
          }
        >
          {file.staged ? <Minus size={12} /> : <Plus size={12} />}
        </button>
      )}

      {/* Status badge */}
      <span
        className={`shrink-0 rounded px-1 py-px text-[10px] font-bold ${
          file.status === "modified"
            ? "text-amber-400"
            : file.status === "added"
              ? "text-green-400"
              : file.status === "deleted"
                ? "text-red-400"
                : file.status === "untracked"
                  ? "text-text-tertiary"
                  : "text-blue-400"
        }`}
      >
        {statusLabel(file.status)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommitLogItem — Single commit in the log
// ---------------------------------------------------------------------------

interface CommitLogItemProps {
  commit: GitCommit;
}

function CommitLogItem({ commit }: CommitLogItemProps) {
  return (
    <div className="flex items-start gap-2 px-2.5 py-1.5">
      <GitCommitIcon size={12} className="text-text-tertiary mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-text-primary truncate text-xs">{commit.message}</p>
        <div className="text-text-tertiary flex items-center gap-1.5 text-[10px]">
          <span className="font-mono">{commit.shortHash}</span>
          <span>·</span>
          <span>{commit.author}</span>
          <span>·</span>
          <span>{commit.relativeDate}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubmoduleItem — Expandable submodule row
// ---------------------------------------------------------------------------

interface SubmoduleItemProps {
  submodule: GitSubmodule;
  onRefresh: () => void;
}

function SubmoduleItem({ submodule, onRefresh }: SubmoduleItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [detail, setDetail] = useState<GitSubmoduleDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  /** Status dot colour based on submodule state. */
  const statusColour =
    submodule.status === "up-to-date"
      ? "#4ade80" // green
      : submodule.status === "modified"
        ? "#fbbf24" // amber
        : "#9ca3af"; // grey — uninitialised

  /** Fetch detailed status when expanding. */
  const handleToggle = useCallback(async () => {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && !detail) {
      setIsLoadingDetail(true);
      try {
        const result = await getSubmoduleStatus(submodule.name);
        setDetail(result);
      } catch (err) {
        console.error("Failed to load submodule detail:", err);
      } finally {
        setIsLoadingDetail(false);
      }
    }
  }, [isExpanded, detail, submodule.name]);

  /** Commit within the submodule. */
  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    setIsCommitting(true);
    setFeedback(null);
    try {
      const result = await commitSubmodule(submodule.name, commitMsg.trim());
      if (result.success) {
        setFeedback({
          type: "success",
          message: `Committed ${result.hash ?? ""}`,
        });
        setCommitMsg("");
        // Refresh detail
        const refreshed = await getSubmoduleStatus(submodule.name);
        setDetail(refreshed);
        onRefresh();
      } else {
        setFeedback({
          type: "error",
          message: result.error ?? "Commit failed",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsCommitting(false);
      setTimeout(() => setFeedback(null), 4_000);
    }
  }, [commitMsg, submodule.name, onRefresh]);

  /** Stage this submodule in the parent repo. */
  const handleStageInParent = useCallback(async () => {
    setIsStaging(true);
    setFeedback(null);
    try {
      await updateSubmoduleRefs([submodule.path]);
      setFeedback({ type: "success", message: "Staged in parent" });
      onRefresh();
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsStaging(false);
      setTimeout(() => setFeedback(null), 4_000);
    }
  }, [submodule.path, onRefresh]);

  const basename = submodule.path.split("/").pop() ?? submodule.path;

  return (
    <div className="border-border/50 border-b last:border-b-0">
      {/* Header row */}
      <button
        type="button"
        onClick={() => void handleToggle()}
        className="hover:bg-bg-hover flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors"
      >
        {isExpanded ? (
          <ChevronDown size={12} className="text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-text-tertiary shrink-0" />
        )}

        {/* Status dot */}
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: statusColour }}
          title={submodule.status}
        />

        <GitFork size={12} className="text-text-tertiary shrink-0" />
        <span className="text-text-primary truncate text-xs font-medium">
          {basename}
        </span>
        <span className="text-text-tertiary truncate text-[10px]">
          {submodule.path !== basename ? submodule.path : ""}
        </span>

        {submodule.branch && (
          <span className="bg-accent-muted text-accent ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium">
            {submodule.branch}
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="bg-bg-hover/30 space-y-2 px-4 pb-3 pt-1">
          {isLoadingDetail ? (
            <div className="text-text-tertiary flex items-center gap-2 py-2 text-xs">
              <Loader2 size={12} className="animate-spin" />
              Loading submodule details…
            </div>
          ) : detail ? (
            <>
              {/* Branch & commit info */}
              <div className="text-text-tertiary flex flex-wrap items-center gap-2 text-[10px]">
                <span>
                  Branch:{" "}
                  <span className="text-text-primary font-medium">
                    {detail.branch}
                  </span>
                </span>
                <span>·</span>
                <span className="font-mono">
                  {submodule.commit.slice(0, 7)}
                </span>
              </div>

              {/* Changed files */}
              {detail.files.length > 0 && (
                <div>
                  <p className="text-text-tertiary mb-1 text-[10px] font-semibold uppercase tracking-wider">
                    Changed Files ({detail.files.length})
                  </p>
                  <div className="space-y-0.5">
                    {detail.files.map((file) => (
                      <div
                        key={`${file.path}-${file.staged ? "s" : "u"}`}
                        className="text-text-primary flex items-center gap-1.5 text-xs"
                      >
                        <StatusIcon status={file.status} />
                        <span className="truncate">{file.path}</span>
                        <span
                          className={`ml-auto shrink-0 text-[10px] font-bold ${
                            file.staged
                              ? "text-green-400"
                              : "text-text-tertiary"
                          }`}
                        >
                          {file.staged ? "S" : statusLabel(file.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Commit input */}
              <div className="space-y-1.5">
                <textarea
                  placeholder="Submodule commit message…"
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void handleCommit();
                    }
                  }}
                  rows={1}
                  className="bg-bg-input border-border text-text-primary placeholder:text-text-tertiary w-full resize-none rounded-md border px-2 py-1 text-xs outline-none focus:border-blue-500/40"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleCommit()}
                    disabled={isCommitting || !commitMsg.trim()}
                    className="bg-accent hover:bg-accent/80 flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isCommitting ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Check size={10} />
                    )}
                    Commit Submodule
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleStageInParent()}
                    disabled={isStaging}
                    className="text-text-tertiary hover:text-text-primary border-border flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isStaging ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Upload size={10} />
                    )}
                    Stage in Parent
                  </button>
                </div>
              </div>

              {/* Feedback */}
              {feedback && (
                <p
                  className={`text-[10px] ${
                    feedback.type === "success"
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {feedback.message}
                </p>
              )}

              {/* Recent commits */}
              {detail.recentCommits.length > 0 && (
                <div>
                  <p className="text-text-tertiary mb-1 text-[10px] font-semibold uppercase tracking-wider">
                    Recent Commits
                  </p>
                  <div className="space-y-0.5">
                    {detail.recentCommits.map((c) => (
                      <div
                        key={c.hash}
                        className="text-text-primary flex items-start gap-1.5 text-xs"
                      >
                        <GitCommitIcon
                          size={10}
                          className="text-text-tertiary mt-0.5 shrink-0"
                        />
                        <span className="truncate">{c.message}</span>
                        <span className="text-text-tertiary ml-auto shrink-0 font-mono text-[10px]">
                          {c.shortHash}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-text-tertiary text-xs">Unable to load details</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitPanel (exported)
// ---------------------------------------------------------------------------

function GitPanel() {
  const openFile = useFileStore((s) => s.openFile);
  const workspaceDirs = useFileStore((s) => s.workspaceDirs);

  // State
  const [branch, setBranch] = useState<string>("");
  const [files, setFiles] = useState<GitStatusFile[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);

  // Submodule state
  const [submodules, setSubmodules] = useState<GitSubmodule[]>([]);
  const [showSubmodules, setShowSubmodules] = useState(true);

  // Section visibility
  const [showStaged, setShowStaged] = useState(true);
  const [showChanges, setShowChanges] = useState(true);
  const [showLog, setShowLog] = useState(true);

  // Split files into staged and unstaged
  const stagedFiles = useMemo(() => files.filter((f) => f.staged), [files]);
  const unstagedFiles = useMemo(() => files.filter((f) => !f.staged), [files]);

  /**
   * Refresh git status and log.
   */
  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statusResult, logResult, submodulesResult] = await Promise.all([
        getGitStatus(),
        getGitLog(20),
        listSubmodules().catch(() => ({ submodules: [] as GitSubmodule[] })),
      ]);

      setBranch(statusResult.branch);
      setFiles(statusResult.files);
      setCommits(logResult.commits);
      setSubmodules(submodulesResult.submodules);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  /**
   * Stage a file.
   */
  const handleStage = useCallback(
    async (filePath: string) => {
      try {
        await stageFiles([filePath]);
        await refreshStatus();
      } catch (err) {
        console.error("Failed to stage file:", err);
      }
    },
    [refreshStatus],
  );

  /**
   * Unstage a file.
   */
  const handleUnstage = useCallback(
    async (filePath: string) => {
      try {
        await unstageFiles([filePath]);
        await refreshStatus();
      } catch (err) {
        console.error("Failed to unstage file:", err);
      }
    },
    [refreshStatus],
  );

  /**
   * Stage all changed files.
   */
  const handleStageAll = useCallback(async () => {
    const paths = unstagedFiles.map((f) => f.path);
    if (paths.length === 0) return;

    try {
      await stageFiles(paths);
      await refreshStatus();
    } catch (err) {
      console.error("Failed to stage all files:", err);
    }
  }, [unstagedFiles, refreshStatus]);

  /**
   * Unstage all staged files.
   */
  const handleUnstageAll = useCallback(async () => {
    const paths = stagedFiles.map((f) => f.path);
    if (paths.length === 0) return;

    try {
      await unstageFiles(paths);
      await refreshStatus();
    } catch (err) {
      console.error("Failed to unstage all files:", err);
    }
  }, [stagedFiles, refreshStatus]);

  /**
   * Create a commit.
   */
  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;

    setIsCommitting(true);
    setCommitError(null);
    setCommitSuccess(null);

    try {
      const result = await createCommit(commitMessage.trim());
      setCommitSuccess(result.output);
      setCommitMessage("");
      await refreshStatus();

      // Clear success message after 4 seconds
      setTimeout(() => setCommitSuccess(null), 4_000);
    } catch (err) {
      setCommitError((err as Error).message);
    } finally {
      setIsCommitting(false);
    }
  }, [commitMessage, refreshStatus]);

  /**
   * Open a file in the editor.
   */
  const handleOpenFile = useCallback(
    async (filePath: string) => {
      // Build full path from workspace dir
      const fullPath =
        workspaceDirs.length > 0 ? `${workspaceDirs[0]}/${filePath}` : filePath;
      try {
        await openFile(fullPath);
      } catch (err) {
        console.error("Failed to open file:", err);
      }
    },
    [openFile, workspaceDirs],
  );

  /**
   * Handle Enter key in commit message.
   */
  const handleCommitKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleCommit();
      }
    },
    [handleCommit],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border-glass flex items-center gap-2 border-b px-3 py-2.5">
        <GitBranch size={14} className="text-accent shrink-0" />
        <span className="text-text-primary text-xs font-semibold tracking-wide">
          Source Control
        </span>

        {branch && (
          <span className="bg-accent-muted text-accent ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
            {branch}
          </span>
        )}

        <button
          type="button"
          onClick={() => void refreshStatus()}
          className="text-text-tertiary hover:text-text-primary ml-auto rounded p-0.5 transition-colors"
          title="Refresh"
          aria-label="Refresh git status"
          disabled={isLoading}
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <p className="text-xs text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              className="text-accent text-xs hover:underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* ── Commit message input ──────────────────────────── */}
            <div className="border-border space-y-1.5 border-b px-3 py-2.5">
              <textarea
                placeholder="Commit message (⌘+Enter to commit)"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={handleCommitKeyDown}
                rows={2}
                className="bg-bg-input border-border text-text-primary placeholder:text-text-tertiary w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:border-blue-500/40"
              />

              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={
                  isCommitting ||
                  !commitMessage.trim() ||
                  stagedFiles.length === 0
                }
                className="bg-accent hover:bg-accent/80 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isCommitting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
                Commit
                {stagedFiles.length > 0 && (
                  <span className="opacity-70">
                    ({stagedFiles.length} file
                    {stagedFiles.length !== 1 ? "s" : ""})
                  </span>
                )}
              </button>

              {/* Commit feedback */}
              {commitError && (
                <p className="text-[10px] text-red-400">{commitError}</p>
              )}
              {commitSuccess && (
                <p className="text-[10px] text-green-400">{commitSuccess}</p>
              )}
            </div>

            {/* ── Staged Changes ─────────────────────────────────── */}
            <div className="border-border border-b">
              <button
                type="button"
                onClick={() => setShowStaged(!showStaged)}
                className="hover:bg-bg-hover flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors"
              >
                {showStaged ? (
                  <ChevronDown size={12} className="text-text-tertiary" />
                ) : (
                  <ChevronRight size={12} className="text-text-tertiary" />
                )}
                <span className="text-text-primary text-xs font-semibold">
                  Staged Changes
                </span>
                <span className="text-text-tertiary text-[10px]">
                  {stagedFiles.length}
                </span>

                {stagedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleUnstageAll();
                    }}
                    className="text-text-tertiary hover:text-text-primary ml-auto rounded p-0.5 transition-colors"
                    title="Unstage all"
                    aria-label="Unstage all files"
                  >
                    <Minus size={12} />
                  </button>
                )}
              </button>

              {showStaged && stagedFiles.length > 0 && (
                <div className="px-1 pb-1">
                  {stagedFiles.map((file) => (
                    <FileChangeItem
                      key={`staged-${file.path}`}
                      file={file}
                      onStage={handleStage}
                      onUnstage={handleUnstage}
                      onOpen={handleOpenFile}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Changes (unstaged) ─────────────────────────────── */}
            <div className="border-border border-b">
              <button
                type="button"
                onClick={() => setShowChanges(!showChanges)}
                className="hover:bg-bg-hover flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors"
              >
                {showChanges ? (
                  <ChevronDown size={12} className="text-text-tertiary" />
                ) : (
                  <ChevronRight size={12} className="text-text-tertiary" />
                )}
                <span className="text-text-primary text-xs font-semibold">
                  Changes
                </span>
                <span className="text-text-tertiary text-[10px]">
                  {unstagedFiles.length}
                </span>

                {unstagedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleStageAll();
                    }}
                    className="text-text-tertiary hover:text-text-primary ml-auto rounded p-0.5 transition-colors"
                    title="Stage all"
                    aria-label="Stage all files"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </button>

              {showChanges && unstagedFiles.length > 0 && (
                <div className="px-1 pb-1">
                  {unstagedFiles.map((file) => (
                    <FileChangeItem
                      key={`unstaged-${file.path}`}
                      file={file}
                      onStage={handleStage}
                      onUnstage={handleUnstage}
                      onOpen={handleOpenFile}
                    />
                  ))}
                </div>
              )}

              {showChanges &&
                stagedFiles.length === 0 &&
                unstagedFiles.length === 0 &&
                !isLoading && (
                  <div className="text-text-tertiary px-3 py-4 text-center text-xs">
                    No changes detected
                  </div>
                )}
            </div>

            {/* ── Submodules ─────────────────────────────────────── */}
            {submodules.length > 0 && (
              <div className="border-border border-b">
                <button
                  type="button"
                  onClick={() => setShowSubmodules(!showSubmodules)}
                  className="hover:bg-bg-hover flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors"
                >
                  {showSubmodules ? (
                    <ChevronDown size={12} className="text-text-tertiary" />
                  ) : (
                    <ChevronRight size={12} className="text-text-tertiary" />
                  )}
                  <GitFork size={12} className="text-text-tertiary" />
                  <span className="text-text-primary text-xs font-semibold">
                    Submodules
                  </span>
                  <span className="text-text-tertiary text-[10px]">
                    {submodules.length}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void refreshStatus();
                    }}
                    className="text-text-tertiary hover:text-text-primary ml-auto rounded p-0.5 transition-colors"
                    title="Refresh submodules"
                    aria-label="Refresh submodules"
                  >
                    <RefreshCw size={10} />
                  </button>
                </button>

                {showSubmodules && (
                  <div>
                    {submodules.map((sub) => (
                      <SubmoduleItem
                        key={sub.path}
                        submodule={sub}
                        onRefresh={() => void refreshStatus()}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Commit Log ──────────────────────────────────────── */}
            <div>
              <button
                type="button"
                onClick={() => setShowLog(!showLog)}
                className="hover:bg-bg-hover flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors"
              >
                {showLog ? (
                  <ChevronDown size={12} className="text-text-tertiary" />
                ) : (
                  <ChevronRight size={12} className="text-text-tertiary" />
                )}
                <Clock size={12} className="text-text-tertiary" />
                <span className="text-text-primary text-xs font-semibold">
                  Recent Commits
                </span>
                <span className="text-text-tertiary text-[10px]">
                  {commits.length}
                </span>
              </button>

              {showLog && (
                <div className="pb-4">
                  {commits.length > 0 ? (
                    commits.map((commit) => (
                      <CommitLogItem key={commit.hash} commit={commit} />
                    ))
                  ) : (
                    <div className="text-text-tertiary px-3 py-4 text-center text-xs">
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 size={12} className="animate-spin" />
                          Loading…
                        </span>
                      ) : (
                        "No commits yet"
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default GitPanel;
