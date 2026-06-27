import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

interface CodeBlockProps {
  children: string;
  className?: string;
}

/**
 * Fenced code block renderer for markdown content.
 * Extracts the language from the className (e.g. 'language-typescript' → 'typescript')
 * and provides a copy-to-clipboard button that briefly shows a check icon on success.
 */
const CodeBlock = ({ children, className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  // Extract the language identifier from the className provided by react-markdown
  const language = className?.replace("language-", "") ?? "";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Silently fail if clipboard access is unavailable
      console.error("Failed to copy to clipboard:", err);
    }
  }, [children]);

  return (
    <div className="group/code border-border overflow-hidden rounded-lg border">
      {/* Header bar with language label and copy button */}
      <div className="bg-bg-elevated border-border flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-text-tertiary select-none text-xs uppercase">
          {language}
        </span>

        <button
          type="button"
          onClick={handleCopy}
          className="hover:bg-bg-hover text-text-tertiary hover:text-text-primary rounded p-1 opacity-0 transition-all duration-150 group-hover/code:opacity-100"
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <Check size={14} className="text-accent" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      </div>

      {/* Code content area */}
      <div className="bg-bg-base overflow-x-auto p-4">
        <pre className="text-text-primary font-mono text-sm">
          <code className={className}>{children}</code>
        </pre>
      </div>
    </div>
  );
};

export default CodeBlock;
