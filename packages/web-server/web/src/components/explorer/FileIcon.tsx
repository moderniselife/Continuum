/**
 * FileIcon — Renders an appropriate icon for a file based on its extension.
 *
 * Maps common file extensions to coloured lucide-react icons for use across
 * the editor tabs, file explorer, and search results.
 */

import {
  FileCode2,
  FileJson2,
  FileText,
  FileType2,
  Image,
  FileBox,
  File,
  Braces,
  Hash,
  Database,
  Cog,
  Globe,
} from "lucide-react";

interface FileIconProps {
  filename: string;
  size?: number;
  className?: string;
}

/** Extension → icon + colour mapping */
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
  html: { icon: Globe, colour: "text-orange-400" },
  htm: { icon: Globe, colour: "text-orange-400" },
  css: { icon: Braces, colour: "text-sky-400" },
  scss: { icon: Braces, colour: "text-pink-400" },
  less: { icon: Braces, colour: "text-indigo-400" },

  // Data
  sql: { icon: Database, colour: "text-emerald-400" },
  graphql: { icon: Hash, colour: "text-pink-400" },
  gql: { icon: Hash, colour: "text-pink-400" },

  // Prose
  md: { icon: FileText, colour: "text-text-secondary" },
  mdx: { icon: FileText, colour: "text-text-secondary" },
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
  py: { icon: FileCode2, colour: "text-green-400" },

  // Rust
  rs: { icon: FileCode2, colour: "text-orange-400" },

  // Go
  go: { icon: FileCode2, colour: "text-cyan-400" },

  // Shell
  sh: { icon: Hash, colour: "text-text-secondary" },
  bash: { icon: Hash, colour: "text-text-secondary" },
  zsh: { icon: Hash, colour: "text-text-secondary" },
};

function getExtension(filename: string): string {
  // Handle compound extensions like .d.ts
  if (filename.endsWith(".d.ts")) return "d.ts";
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function FileIcon({
  filename,
  size = 14,
  className = "",
}: FileIconProps) {
  const ext = getExtension(filename);
  const mapping = ICON_MAP[ext] ?? { icon: File, colour: "text-text-tertiary" };
  const Icon = mapping.icon;

  return (
    <Icon size={size} className={`${mapping.colour} ${className} shrink-0`} />
  );
}

export default FileIcon;
