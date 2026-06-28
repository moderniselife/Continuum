/**
 * TokenUsageBadge — Compact inline badge showing current session token
 * usage and estimated cost. Self-contained — calls useLLMLog internally.
 *
 * Designed to sit in the InputToolbar next to model/mode selectors.
 * Shows "⚡ 1.2K · $0.003" and expands on click to a full breakdown.
 *
 * @module components/chat/TokenUsageBadge
 */

import { useEffect, useMemo, useRef, useState } from "react";
import useLLMLog from "../../hooks/useLLMLog";
import useTotalUsage from "../../hooks/useTotalUsage";

/** Format a large token count to a human-readable string (e.g. 1234 → "1.2K"). */
function formatTokens(count: number): string {
  if (count === 0) return "0";
  if (count < 1_000) return count.toString();
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

/** Format cost as currency. */
function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost);
}

export function TokenUsageBadge() {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);

  const llmLog = useLLMLog();
  const usage = useTotalUsage(llmLog);

  const totalTokens = usage.totalPromptTokens + usage.totalGeneratedTokens;

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;

    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        badgeRef.current &&
        !badgeRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPopover]);

  // Parse the breakdown strings to extract model names and costs
  const costBreakdownByModel = useMemo(() => {
    const map = new Map<string, { cost: number; detail: string }>();

    for (const bd of usage.costBreakdowns) {
      const key = bd.breakdown.split("\n")[0]?.trim() || "Unknown";
      const existing = map.get(key) || { cost: 0, detail: bd.breakdown };
      existing.cost += bd.cost || 0;
      map.set(key, existing);
    }

    return Array.from(map.entries()).map(([label, data]) => ({
      label,
      ...data,
    }));
  }, [usage.costBreakdowns]);

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={badgeRef}
        onClick={() => setShowPopover(!showPopover)}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors hover:bg-[color:var(--vscode-toolbar-hoverBackground)]"
        title="Token usage — click for details"
      >
        <span>⚡</span>
        <span className="text-[color:var(--vscode-descriptionForeground)]">
          {totalTokens > 0 ? formatTokens(totalTokens) : "0"}
        </span>
        {usage.totalCost > 0 && (
          <>
            <span className="text-[color:var(--vscode-descriptionForeground)] opacity-40">
              ·
            </span>
            <span style={{ color: "#4ade80" }}>
              {formatCost(usage.totalCost)}
            </span>
          </>
        )}
      </button>

      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-lg border border-[color:var(--vscode-panel-border)] bg-[color:var(--vscode-editor-background)] p-3 shadow-xl"
        >
          <div className="mb-3 text-xs font-semibold text-[color:var(--vscode-foreground)]">
            Session Token Usage
          </div>

          {totalTokens === 0 && usage.totalInteractions === 0 ? (
            <div className="py-2 text-center text-xs text-[color:var(--vscode-descriptionForeground)]">
              No token usage yet this session.
              <br />
              Send a message to start tracking.
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-md bg-[color:var(--vscode-input-background)] px-2 py-1.5 text-center">
                  <div className="text-[10px] text-[color:var(--vscode-descriptionForeground)]">
                    Input
                  </div>
                  <div
                    className="text-xs font-medium"
                    style={{ color: "#60a5fa" }}
                  >
                    {formatTokens(usage.totalPromptTokens)}
                  </div>
                </div>
                <div className="rounded-md bg-[color:var(--vscode-input-background)] px-2 py-1.5 text-center">
                  <div className="text-[10px] text-[color:var(--vscode-descriptionForeground)]">
                    Output
                  </div>
                  <div
                    className="text-xs font-medium"
                    style={{ color: "#c084fc" }}
                  >
                    {formatTokens(usage.totalGeneratedTokens)}
                  </div>
                </div>
                <div className="rounded-md bg-[color:var(--vscode-input-background)] px-2 py-1.5 text-center">
                  <div className="text-[10px] text-[color:var(--vscode-descriptionForeground)]">
                    Total
                  </div>
                  <div className="text-xs font-medium text-[color:var(--vscode-foreground)]">
                    {formatTokens(totalTokens)}
                  </div>
                </div>
              </div>

              {/* Additional stats */}
              <div className="mb-3 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-3">
                  {usage.totalThinkingTokens > 0 && (
                    <span className="text-[color:var(--vscode-descriptionForeground)]">
                      🧠 {formatTokens(usage.totalThinkingTokens)} thinking
                    </span>
                  )}
                  {usage.totalCachedTokens > 0 && (
                    <span className="text-[color:var(--vscode-descriptionForeground)]">
                      💾 {formatTokens(usage.totalCachedTokens)} cached
                    </span>
                  )}
                </div>
                <span className="text-[color:var(--vscode-descriptionForeground)]">
                  {usage.totalInteractions} request
                  {usage.totalInteractions !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Cost breakdown by model */}
              {costBreakdownByModel.length > 0 && (
                <>
                  <div className="mb-1.5 text-[10px] font-semibold text-[color:var(--vscode-descriptionForeground)]">
                    Cost by Model
                  </div>
                  <div className="flex flex-col gap-1">
                    {costBreakdownByModel.map((entry) => (
                      <div
                        key={entry.label}
                        className="flex items-center justify-between rounded-sm px-1.5 py-1 text-[10px] hover:bg-[color:var(--vscode-list-hoverBackground)]"
                      >
                        <span className="truncate text-[color:var(--vscode-foreground)]">
                          {entry.label}
                        </span>
                        <span
                          className="ml-2 font-mono"
                          style={{ color: "#4ade80" }}
                        >
                          {formatCost(entry.cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Total cost */}
              <div className="mt-2 flex items-center justify-between border-t border-[color:var(--vscode-panel-border)] pt-2">
                <span className="text-xs font-semibold text-[color:var(--vscode-foreground)]">
                  Estimated Total
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ color: "#4ade80" }}
                >
                  {formatCost(usage.totalCost)}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default TokenUsageBadge;
