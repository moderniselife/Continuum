import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface MigrationResult {
  migrated: boolean;
  itemsCopied: string[];
  errors: string[];
}

/**
 * Migrates user data from Continue (~/.continue) to Continuum (~/.continuum).
 * Copies data rather than moving it, so the old Continue installation keeps working.
 * Only runs once — skips if ~/.continuum already exists or ~/.continue doesn't exist.
 */
export function migrateFromContinue(): MigrationResult {
  const continueDir = path.join(os.homedir(), ".continue");
  const continuumDir = path.join(os.homedir(), ".continuum");
  const markerFile = path.join(continuumDir, ".migration_complete");

  const result: MigrationResult = {
    migrated: false,
    itemsCopied: [],
    errors: [],
  };

  // Skip if migration already complete
  if (fs.existsSync(markerFile)) {
    return result;
  }

  // Skip if no Continue installation to migrate from
  if (!fs.existsSync(continueDir)) {
    return result;
  }

  // If continuum dir already has content, do a selective merge —
  // migrate any items that don't already exist in the destination.
  // This prevents chat history loss when ~/.continuum was partially set up.
  const continuumHasContent =
    fs.existsSync(continuumDir) && fs.readdirSync(continuumDir).length > 0;

  // Create continuum directory
  if (!fs.existsSync(continuumDir)) {
    fs.mkdirSync(continuumDir, { recursive: true });
  }

  // Items to migrate — renamed files use the new Continuum conventions
  const itemsToMigrate: {
    src: string;
    dest: string;
    isDir?: boolean;
  }[] = [
    { src: "config.yaml", dest: "config.yaml" },
    { src: "config.json", dest: "config.json" },
    { src: "sessions", dest: "sessions", isDir: true },
    { src: "permissions.yaml", dest: "permissions.yaml" },
    { src: ".continueignore", dest: ".continuumignore" },
    { src: ".continuerc.json", dest: ".continuumrc.json" },
    { src: "models", dest: "models", isDir: true },
    { src: "logs", dest: "logs", isDir: true },
    { src: "index", dest: "index", isDir: true },
    { src: ".utils", dest: ".utils", isDir: true },
  ];

  for (const item of itemsToMigrate) {
    const srcPath = path.join(continueDir, item.src);
    const destPath = path.join(continuumDir, item.dest);

    if (!fs.existsSync(srcPath)) {
      continue;
    }

    // When continuum already has content, skip files that already exist
    // but still merge directory contents (e.g. individual session files).
    if (continuumHasContent && !item.isDir && fs.existsSync(destPath)) {
      continue;
    }

    try {
      if (item.isDir) {
        // noClobber=true when merging into existing dir — don't overwrite
        copyDirRecursive(srcPath, destPath, continuumHasContent);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      result.itemsCopied.push(item.src);
    } catch (error) {
      result.errors.push(`Failed to copy ${item.src}: ${error}`);
    }
  }

  // Write migration marker
  fs.writeFileSync(
    markerFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        itemsCopied: result.itemsCopied,
        errors: result.errors,
        sourceDir: continueDir,
      },
      null,
      2,
    ),
  );

  result.migrated = true;
  return result;
}

/**
 * Recursively copies a directory. When noClobber is true, existing files
 * in the destination are preserved (merge mode for selective migration).
 */
function copyDirRecursive(src: string, dest: string, noClobber = false): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, noClobber);
    } else {
      // Skip if file already exists and we're in no-clobber mode
      if (noClobber && fs.existsSync(destPath)) {
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
