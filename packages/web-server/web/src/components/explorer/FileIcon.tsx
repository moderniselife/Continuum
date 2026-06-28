/**
 * FileIcon — Maps file extensions to colour-coded Lucide icons.
 *
 * Used throughout the file explorer to visually distinguish file types.
 * Directories show a Folder/FolderOpen icon in amber.
 *
 * Supports both the original `filename`-only API (for editor tabs, etc.)
 * and the full `name + isDirectory + isOpen` API (for the file tree).
 */

import {
  File,
  FileBox,
  FileCode,
  FileCode2,
  FileJson2,
  FileText,
  FileType2,
  Folder,
  FolderOpen,
  Braces,
  Cog,
  Database,
  Globe,
  Hash,
  Image,
  Palette,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Prop types — supports two calling conventions
// ---------------------------------------------------------------------------

interface FileIconBaseProps {
  /** Icon size in pixels. */
  size?: number;
  /** Additional Tailwind classes. */
  className?: string;
}

interface FileIconByName extends FileIconBaseProps {
  /** File or directory name (used for extension matching). */
  name: string;
  /** Whether this icon represents a directory. */
  isDirectory: boolean;
  /** Whether the directory is currently expanded (directories only). */
  isOpen?: boolean;
  filename?: never;
}

interface FileIconByFilename extends FileIconBaseProps {
  /** Filename for backward-compat with the original API. */
  filename: string;
  name?: never;
  isDirectory?: never;
  isOpen?: never;
}

type FileIconProps = FileIconByName | FileIconByFilename;

// ---------------------------------------------------------------------------
// Extension → icon + colour mapping
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, { icon: typeof File; colour: string }> = {
  // TypeScript / JavaScript
  ts: { icon: FileCode2, colour: "text-blue-400" },
  tsx: { icon: FileCode2, colour: "text-blue-400" },
  js: { icon: FileCode2, colour: "text-yellow-400" },
  jsx: { icon: FileCode2, colour: "text-yellow-400" },
  mjs: { icon: FileCode2, colour: "text-yellow-400" },
  cjs: { icon: FileCode2, colour: "text-yellow-400" },

  // Markup / Config
  json: { icon: FileJson2, colour: "text-yellow-300" },
  jsonc: { icon: FileJson2, colour: "text-yellow-300" },
  yaml: { icon: Cog, colour: "text-orange-300" },
  yml: { icon: Cog, colour: "text-orange-300" },
  toml: { icon: Cog, colour: "text-orange-300" },

  // Web
  html: { icon: Globe, colour: "text-red-400" },
  htm: { icon: Globe, colour: "text-red-400" },
  css: { icon: Palette, colour: "text-purple-400" },
  scss: { icon: Palette, colour: "text-purple-400" },
  less: { icon: Palette, colour: "text-purple-400" },

  // Data
  sql: { icon: Database, colour: "text-emerald-400" },
  graphql: { icon: Hash, colour: "text-pink-400" },
  gql: { icon: Hash, colour: "text-pink-400" },

  // Prose
  md: { icon: FileText, colour: "text-gray-400" },
  mdx: { icon: FileText, colour: "text-gray-400" },
  txt: { icon: FileText, colour: "text-text-tertiary" },

  // Images
  png: { icon: Image, colour: "text-green-400" },
  jpg: { icon: Image, colour: "text-green-400" },
  jpeg: { icon: Image, colour: "text-green-400" },
  svg: { icon: Image, colour: "text-amber-400" },
  webp: { icon: Image, colour: "text-green-400" },
  gif: { icon: Image, colour: "text-green-400" },

  // Types / Declarations
  "d.ts": { icon: FileType2, colour: "text-blue-300" },

  // Packages
  lock: { icon: FileBox, colour: "text-text-tertiary" },

  // Python
  py: { icon: FileCode2, colour: "text-blue-300" },

  // Rust
  rs: { icon: FileCode2, colour: "text-orange-500" },

  // Go
  go: { icon: FileCode2, colour: "text-cyan-400" },

  // Shell
  sh: { icon: FileCode, colour: "text-green-300" },
  bash: { icon: FileCode, colour: "text-green-300" },
  zsh: { icon: FileCode, colour: "text-green-300" },

  // Java / Kotlin
  java: { icon: FileCode2, colour: "text-red-300" },
  kt: { icon: FileCode2, colour: "text-red-300" },
  kts: { icon: FileCode2, colour: "text-red-300" },

  // C / C++
  c: { icon: FileCode2, colour: "text-blue-200" },
  cpp: { icon: FileCode2, colour: "text-blue-200" },
  h: { icon: FileCode2, colour: "text-blue-200" },
  hpp: { icon: FileCode2, colour: "text-blue-200" },

  // Swift
  swift: { icon: FileCode2, colour: "text-orange-300" },

  // Ruby
  rb: { icon: FileCode2, colour: "text-red-500" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(filename: string): string {
  // Handle compound extensions like .d.ts
  if (filename.endsWith(".d.ts")) return "d.ts";
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileIcon(props: FileIconProps) {
  const { size = 16, className = "" } = props;

  // Resolve the display name from either prop shape
  const displayName =
    "filename" in props && props.filename
      ? props.filename
      : (props as FileIconByName).name;

  const isDir = "isDirectory" in props ? props.isDirectory : false;
  const isOpen = "isOpen" in props ? props.isOpen : false;

  // Directory icons
  if (isDir) {
    const IconComponent = isOpen ? FolderOpen : Folder;
    return (
      <IconComponent
        size={size}
        className={`shrink-0 text-amber-400 ${className}`}
      />
    );
  }

  // File icons — match by extension
  const ext = getExtension(displayName);
  const mapping = ICON_MAP[ext] ?? { icon: File, colour: "text-text-tertiary" };
  const Icon = mapping.icon;

  return (
    <Icon size={size} className={`shrink-0 ${mapping.colour} ${className}`} />
  );
}

export default FileIcon;
