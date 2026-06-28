/**
 * TokenTracker — Status bar widget for real-time token usage and cost.
 *
 * Shows a compact inline token count + cost. Clicking toggles an expanded
 * popover with model info, input/output breakdown, and a reset button.
 *
 * @module components/tokens/TokenTracker
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Zap, RotateCcw, ChevronUp } from "lucide-react";
import { useTokenStore } from "@/stores/tokenStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a token count for compact display (e.g. 1.2K, 3.4M). */
function formatTokensCompact(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/** Format a currency value in AUD style. */
function formatCost(cost: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cost < 0.01 ? 4 : 2,
    maximumFractionDigits: cost < 0.01 ? 4 : 3,
  }).format(cost);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TokenTracker() {
  const [expanded, setExpanded] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const inputTokens = useTokenStore((s) => s.inputTokens);
  const outputTokens = useTokenStore((s) => s.outputTokens);
  const totalTokens = useTokenStore((s) => s.totalTokens);
  const estimatedCost = useTokenStore((s) => s.estimatedCost);
  const modelName = useTokenStore((s) => s.modelName);
  const reset = useTokenStore((s) => s.reset);

  // Close popover when clicking outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      popoverRef.current &&
      !popoverRef.current.contains(e.target as Node) &&
      triggerRef.current &&
      !triggerRef.current.contains(e.target as Node)
    ) {
      setExpanded(false);
    }
  }, []);

  useEffect(() => {
    if (expanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [expanded, handleClickOutside]);

  const handleReset = useCallback(() => {
    reset();
    setExpanded(false);
  }, [reset]);

  return (
    <div className="relative">
      {/* ── Trigger: compact inline widget ─────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="hover:bg-bg-hover flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] transition-colors"
        title="Token usage"
      >
        <Zap size={11} className="text-accent" />
        <span className="text-text-secondary tabular-nums">
          {formatTokensCompact(totalTokens)} tokens
        </span>
        <span className="text-text-tertiary">·</span>
        <span className="text-text-tertiary tabular-nums">
          ~{formatCost(estimatedCost)}
        </span>
        <ChevronUp
          size={10}
          className={`text-text-tertiary transition-transform duration-200 ${
            expanded ? "" : "rotate-180"
          }`}
        />
      </button>

      {/* ── Expanded popover ───────────────────────────────── */}
      {expanded && (
        <div
          ref={popoverRef}
          className="glass-heavy border-border-glass animate-fade-in absolute bottom-full left-0 mb-1.5 w-64 rounded-xl border p-3 shadow-xl"
        >
          {/* Model name */}
          {modelName && (
            <div className="mb-2.5 flex items-center gap-2">
              <Zap size={13} className="text-accent shrink-0" />
              <span className="text-text-primary truncate font-mono text-xs font-medium">
                {modelName}
              </span>
            </div>
          )}

          {/* Token breakdown */}
          <div className="mb-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-text-tertiary text-xs">Input tokens</span>
              <span className="text-text-primary font-mono text-xs tabular-nums">
                {inputTokens.toLocaleString("en-AU")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-tertiary text-xs">Output tokens</span>
              <span className="text-text-primary font-mono text-xs tabular-nums">
                {outputTokens.toLocaleString("en-AU")}
              </span>
            </div>
            <div className="border-border flex items-center justify-between border-t pt-1.5">
              <span className="text-text-secondary text-xs font-medium">
                Total
              </span>
              <span className="text-accent font-mono text-xs font-medium tabular-nums">
                {totalTokens.toLocaleString("en-AU")}
              </span>
            </div>
          </div>

          {/* Estimated cost */}
          <div className="border-border mb-3 flex items-center justify-between border-t pt-2">
            <span className="text-text-tertiary text-xs">
              Estimated session cost
            </span>
            <span className="text-text-primary font-mono text-xs font-medium tabular-nums">
              {formatCost(estimatedCost)}
            </span>
          </div>

          {/* Reset button */}
          <button
            type="button"
            onClick={handleReset}
            className="glass-subtle border-border-glass hover:border-border-accent/30 hover:text-accent flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors"
          >
            <RotateCcw size={12} />
            Reset counters
          </button>
        </div>
      )}
    </div>
  );
}

export default TokenTracker;
