/**
 * FileTreeItem — A single recursive tree node in the file explorer.
 *
 * Renders a file or directory row with:
 * - Indentation based on depth
 * - Chevron toggle for directories (rotates on expand)
 * - Colour-coded file icon via `<FileIcon />`
 * - Active-file highlighting + modified (dirty) indicator
 * - Delete button on hover
 * - Fade-in animation for newly loaded items
 */

import { useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { useFileStore, type FileNode } from "@/stores/fileStore";
import FileIcon from "./FileIcon";

interface FileTreeItemProps {
  /** The file/directory node to render. */
  node: FileNode;
  /** Current nesting depth (used for indentation). */
  depth: number;
}

function FileTreeItem({ node, depth }: FileTreeItemProps) {
  const expandedDirs = useFileStore((s) => s.expandedDirs);
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const openFiles = useFileStore((s) => s.openFiles);
  const toggleDir = useFileStore((s) => s.toggleDir);
  const openFile = useFileStore((s) => s.openFile);
  const deleteItem = useFileStore((s) => s.deleteItem);

  const [isHovered, setIsHovered] = useState(false);

  const isDirectory = node.type === "directory";
  const isExpanded = expandedDirs.has(node.path);
  const isActive = activeFilePath === node.path;
  const isDirty = openFiles.some((f) => f.path === node.path && f.isDirty);

  const handleClick = () => {
    if (isDirectory) {
      toggleDir(node.path);
    } else {
      openFile(node.path);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Simple confirmation before deleting
    if (window.confirm(`Delete "${node.name}"?`)) {
      deleteItem(node.path);
    }
  };

  return (
    <>
      {/* Row */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`animate-fade-in group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-[3px] text-left text-[13px] transition-colors duration-150 ${
          isActive
            ? "bg-bg-active text-text-primary"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        }`}
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
        title={node.path}
      >
        {/* Chevron (directories only) */}
        {isDirectory ? (
          <ChevronRight
            size={14}
            className={`text-text-tertiary shrink-0 transition-transform duration-150 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* File/folder icon */}
        <FileIcon
          name={node.name}
          isDirectory={isDirectory}
          isOpen={isExpanded}
          size={15}
        />

        {/* Name */}
        <span className="truncate">{node.name}</span>

        {/* Dirty indicator */}
        {isDirty && (
          <span
            className="bg-accent ml-auto h-2 w-2 shrink-0 rounded-full"
            title="Unsaved changes"
          />
        )}

        {/* Delete button (hover only) */}
        {isHovered && !isDirty && (
          <button
            type="button"
            onClick={handleDelete}
            className="text-text-tertiary hover:text-error ml-auto shrink-0 rounded p-0.5 transition-colors"
            title={`Delete ${node.name}`}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Children (recursive) */}
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
}

export default FileTreeItem;
