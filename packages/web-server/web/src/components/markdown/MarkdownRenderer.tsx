import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import CodeBlock from "@/components/markdown/CodeBlock";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renders markdown content with syntax highlighting, GFM support,
 * and custom-styled elements for the Continuum Web IDE.
 */
const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const components: Components = {
    // Distinguish fenced code blocks from inline code
    code({ className, children, ...props }) {
      // Fenced blocks receive a className like 'language-typescript'
      if (className) {
        return (
          <CodeBlock className={className}>
            {String(children).replace(/\n$/, "")}
          </CodeBlock>
        );
      }

      // Inline code styling
      return (
        <code
          className="bg-bg-elevated text-accent rounded px-1.5 py-0.5 font-mono text-[0.85em]"
          {...props}
        >
          {children}
        </code>
      );
    },

    // Links
    a({ children, ...props }) {
      return (
        <a
          className="text-accent transition-colors duration-150 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
          {...props}
        >
          {children}
        </a>
      );
    },

    // Headings
    h1({ children, ...props }) {
      return (
        <h1
          className="text-text-primary mb-3 mt-6 text-2xl font-semibold"
          {...props}
        >
          {children}
        </h1>
      );
    },
    h2({ children, ...props }) {
      return (
        <h2
          className="text-text-primary mb-2 mt-5 text-xl font-semibold"
          {...props}
        >
          {children}
        </h2>
      );
    },
    h3({ children, ...props }) {
      return (
        <h3
          className="text-text-primary mb-2 mt-4 text-lg font-semibold"
          {...props}
        >
          {children}
        </h3>
      );
    },

    // Lists
    ul({ children, ...props }) {
      return (
        <ul
          className="text-text-primary my-2 list-inside list-disc space-y-1"
          {...props}
        >
          {children}
        </ul>
      );
    },
    ol({ children, ...props }) {
      return (
        <ol
          className="text-text-primary my-2 list-inside list-decimal space-y-1"
          {...props}
        >
          {children}
        </ol>
      );
    },

    // Blockquote
    blockquote({ children, ...props }) {
      return (
        <blockquote
          className="border-accent text-text-secondary my-3 border-l-2 pl-4 italic"
          {...props}
        >
          {children}
        </blockquote>
      );
    },

    // Paragraph
    p({ children, ...props }) {
      return (
        <p className="text-text-primary my-2 leading-relaxed" {...props}>
          {children}
        </p>
      );
    },

    // Table elements
    table({ children, ...props }) {
      return (
        <div className="my-3 overflow-x-auto">
          <table
            className="border-border w-full border-collapse border text-sm"
            {...props}
          >
            {children}
          </table>
        </div>
      );
    },
    th({ children, ...props }) {
      return (
        <th
          className="border-border bg-bg-elevated text-text-primary border px-3 py-2 text-left font-semibold"
          {...props}
        >
          {children}
        </th>
      );
    },
    td({ children, ...props }) {
      return (
        <td
          className="border-border text-text-secondary border px-3 py-2"
          {...props}
        >
          {children}
        </td>
      );
    },
  };

  return (
    <div className="animate-fade-in">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
