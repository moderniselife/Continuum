import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync, spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";

import type {
  IDE,
  IdeInfo,
  IdeSettings,
  FileType,
  Range,
  RangeInFile,
  Location,
  Problem,
  Thread,
  IndexTag,
  FileStatsMap,
  TerminalOptions,
  ToastType,
  DocumentSymbol,
  SignatureHelp,
} from "core/index.js";

/**
 * WebIDE — implements Core's IDE interface for the web server context.
 *
 * Provides filesystem access, git operations, terminal execution, and
 * other IDE capabilities using Node.js APIs instead of VS Code APIs.
 */
export class WebIDE implements IDE {
  private workspaceDirs: string[];
  private uniqueId: string;

  constructor(workspaceDirs: string[]) {
    this.workspaceDirs = workspaceDirs.map((d) => path.resolve(d));
    this.uniqueId = uuidv4();
  }

  async getIdeInfo(): Promise<IdeInfo> {
    return {
      ideType: "web" as any,
      name: "Continuum Web",
      version: "0.1.0",
      remoteName: os.hostname(),
      extensionVersion: "0.1.0",
    };
  }

  async getIdeSettings(): Promise<IdeSettings> {
    return {
      remoteConfigServerUrl: undefined,
      remoteConfigSyncPeriod: 60,
      userToken: "",
      enableControlServerBeta: false,
      pauseCodebaseIndexOnStart: false,
      enableDebugLogs: false,
      enableTabAutocomplete: false,
    } as IdeSettings;
  }

  async getDiff(includeUnstaged: boolean): Promise<string[]> {
    const diffs: string[] = [];
    for (const dir of this.workspaceDirs) {
      try {
        const cmd = includeUnstaged ? "git diff" : "git diff --cached";
        const result = execSync(cmd, {
          cwd: dir,
          encoding: "utf-8",
          timeout: 10_000,
        });
        if (result.trim()) diffs.push(result);
      } catch {
        // Not a git repo or git not available
      }
    }
    return diffs;
  }

  async getClipboardContent(): Promise<{ text: string; copiedAt: string }> {
    return { text: "", copiedAt: new Date().toISOString() };
  }

  async isTelemetryEnabled(): Promise<boolean> {
    return false;
  }

  async isWorkspaceRemote(): Promise<boolean> {
    return true; // Web server is always "remote"
  }

  async getUniqueId(): Promise<string> {
    return this.uniqueId;
  }

  async getTerminalContents(): Promise<string> {
    return "";
  }

  async getDebugLocals(_threadIndex: number): Promise<string> {
    return "";
  }

  async getTopLevelCallStackSources(
    _threadIndex: number,
    _stackDepth: number,
  ): Promise<string[]> {
    return [];
  }

  async getAvailableThreads(): Promise<Thread[]> {
    return [];
  }

  async getWorkspaceDirs(): Promise<string[]> {
    return this.workspaceDirs;
  }

  async fileExists(fileUri: string): Promise<boolean> {
    try {
      const filePath = this.resolveUri(fileUri);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  async writeFile(filePath: string, contents: string): Promise<void> {
    const resolved = this.resolveUri(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, contents, "utf-8");
  }

  async removeFile(filePath: string): Promise<void> {
    const resolved = this.resolveUri(filePath);
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  }

  async showVirtualFile(_title: string, _contents: string): Promise<void> {
    // No-op in web context — the GUI handles display
  }

  async openFile(_filePath: string): Promise<void> {
    // No-op — GUI handles file viewing
  }

  async openUrl(_url: string): Promise<void> {
    // No-op in headless context
  }

  async runCommand(command: string, _options?: TerminalOptions): Promise<void> {
    const cwd = this.workspaceDirs[0] ?? process.cwd();
    return new Promise((resolve, reject) => {
      const child = spawn("sh", ["-c", command], {
        cwd,
        stdio: "pipe",
        timeout: 60_000,
      });

      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Command exited with code ${code}`));
      });

      child.on("error", reject);
    });
  }

  async saveFile(_fileUri: string): Promise<void> {
    // No-op — files are written directly
  }

  async readFile(fileUri: string): Promise<string> {
    const filePath = this.resolveUri(fileUri);
    return fs.readFileSync(filePath, "utf-8");
  }

  async readRangeInFile(fileUri: string, range: Range): Promise<string> {
    const content = await this.readFile(fileUri);
    const lines = content.split("\n");
    const startLine = Math.max(0, range.start.line);
    const endLine = Math.min(lines.length - 1, range.end.line);
    return lines.slice(startLine, endLine + 1).join("\n");
  }

  async showLines(
    _fileUri: string,
    _startLine: number,
    _endLine: number,
  ): Promise<void> {
    // No-op — GUI handles display
  }

  async getOpenFiles(): Promise<string[]> {
    return [];
  }

  async getCurrentFile(): Promise<
    undefined | { isUntitled: boolean; path: string; contents: string }
  > {
    return undefined;
  }

  async getPinnedFiles(): Promise<string[]> {
    return [];
  }

  async getSearchResults(
    query: string,
    maxResults: number = 100,
  ): Promise<string> {
    const cwd = this.workspaceDirs[0];
    if (!cwd) return "";
    try {
      return execSync(
        `grep -rn --include="*" -l "${query}" . | head -${maxResults}`,
        { cwd, encoding: "utf-8", timeout: 10_000 },
      );
    } catch {
      return "";
    }
  }

  async getFileResults(
    pattern: string,
    maxResults: number = 100,
  ): Promise<string> {
    const cwd = this.workspaceDirs[0];
    if (!cwd) return "";
    try {
      return execSync(`find . -name "${pattern}" | head -${maxResults}`, {
        cwd,
        encoding: "utf-8",
        timeout: 10_000,
      });
    } catch {
      return "";
    }
  }

  async subprocess(command: string, cwd?: string): Promise<[string, string]> {
    const workingDir = cwd ?? this.workspaceDirs[0] ?? process.cwd();
    try {
      const stdout = execSync(command, {
        cwd: workingDir,
        encoding: "utf-8",
        timeout: 30_000,
      });
      return [stdout, ""];
    } catch (error: any) {
      return [error.stdout ?? "", error.stderr ?? error.message];
    }
  }

  async getProblems(_fileUri?: string): Promise<Problem[]> {
    return [];
  }

  async getBranch(dir: string): Promise<string> {
    try {
      return execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: dir,
        encoding: "utf-8",
        timeout: 5_000,
      }).trim();
    } catch {
      return "main";
    }
  }

  async getTags(_artifactId: string): Promise<IndexTag[]> {
    return [];
  }

  async getRepoName(dir: string): Promise<string | undefined> {
    try {
      const remote = execSync("git remote get-url origin", {
        cwd: dir,
        encoding: "utf-8",
        timeout: 5_000,
      }).trim();
      const match = remote.match(/\/([^/]+?)(?:\.git)?$/);
      return match?.[1];
    } catch {
      return path.basename(dir);
    }
  }

  async showToast(
    _type: ToastType,
    message: string,
    ..._otherParams: any[]
  ): Promise<any> {
    console.log(`[Toast] ${message}`);
    return undefined;
  }

  async getGitRootPath(dir: string): Promise<string | undefined> {
    try {
      return execSync("git rev-parse --show-toplevel", {
        cwd: dir,
        encoding: "utf-8",
        timeout: 5_000,
      }).trim();
    } catch {
      return undefined;
    }
  }

  async listDir(dir: string): Promise<[string, FileType][]> {
    const resolved = this.resolveUri(dir);
    if (!fs.existsSync(resolved)) return [];

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    return entries.map((entry) => {
      const fileType: FileType = entry.isDirectory()
        ? (2 as FileType) // Directory
        : entry.isSymbolicLink()
          ? (64 as FileType) // Symlink
          : (1 as FileType); // File
      return [path.join(dir, entry.name), fileType];
    });
  }

  async getFileStats(files: string[]): Promise<FileStatsMap> {
    const stats: FileStatsMap = {};
    for (const file of files) {
      try {
        const resolved = this.resolveUri(file);
        const stat = fs.statSync(resolved);
        stats[file] = {
          lastModified: stat.mtimeMs,
          created: stat.birthtimeMs,
          size: stat.size,
        };
      } catch {
        // File not found — skip
      }
    }
    return stats;
  }

  async readSecrets(_keys: string[]): Promise<Record<string, string>> {
    // Read from environment variables as a simple secret store
    const secrets: Record<string, string> = {};
    for (const key of _keys) {
      const envKey = `CONTINUUM_SECRET_${key.toUpperCase().replace(/\./g, "_")}`;
      const value = process.env[envKey];
      if (value) secrets[key] = value;
    }
    return secrets;
  }

  async writeSecrets(_secrets: { [key: string]: string }): Promise<void> {
    // Secrets written via env vars are read-only
    console.warn(
      "[WebIDE] writeSecrets is not supported in web server mode. Use environment variables.",
    );
  }

  async gotoDefinition(_location: Location): Promise<RangeInFile[]> {
    return [];
  }

  async gotoTypeDefinition(_location: Location): Promise<RangeInFile[]> {
    return [];
  }

  async getSignatureHelp(_location: Location): Promise<SignatureHelp | null> {
    return null;
  }

  async getReferences(_location: Location): Promise<RangeInFile[]> {
    return [];
  }

  async getDocumentSymbols(
    _textDocumentIdentifier: string,
  ): Promise<DocumentSymbol[]> {
    return [];
  }

  onDidChangeActiveTextEditor(_callback: (fileUri: string) => void): void {
    // No-op in web context — no active editor tracking
  }

  /**
   * Resolve a file URI or path to an absolute filesystem path.
   */
  private resolveUri(fileUri: string): string {
    // Handle file:// URIs
    if (fileUri.startsWith("file://")) {
      return decodeURIComponent(fileUri.replace("file://", ""));
    }
    // Handle absolute paths
    if (path.isAbsolute(fileUri)) {
      return fileUri;
    }
    // Handle relative paths — resolve against first workspace dir
    return path.resolve(this.workspaceDirs[0] ?? process.cwd(), fileUri);
  }
}
