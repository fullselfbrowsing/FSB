import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SCREENSHOT_NAME = /^fsb-screenshot-[0-9]+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/i;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type ScreenshotWriteResult = {
  filePath: string | null;
  warning?: { code: 'SCREENSHOT_FILE_WRITE_FAILED'; message: string };
};

export type ManagedScreenshotAttestor = {
  attestManagedPath(filePath: string): Promise<string | null>;
};

type ScreenshotStoreOptions = {
  directory?: string;
  now?: () => number;
  uuid?: () => string;
  writeFile?: (
    handle: Awaited<ReturnType<typeof fs.open>>,
    bytes: Buffer,
  ) => Promise<void>;
};

function decodePngBase64(data: string): Buffer {
  if (typeof data !== 'string' || data.length === 0 || data.length % 4 !== 0
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error('Screenshot payload is not valid base64');
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Screenshot payload is not a PNG');
  }
  return bytes;
}

export function createScreenshotStore(options: ScreenshotStoreOptions = {}) {
  const directory = options.directory ?? path.join(os.homedir(), '.fsb', 'screenshots');
  const now = options.now ?? Date.now;
  const uuid = options.uuid ?? randomUUID;
  const writeFile = options.writeFile ?? (async (handle, bytes) => { await handle.writeFile(bytes); });

  async function ensurePrivateDirectory(): Promise<void> {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
  }

  async function cleanup(): Promise<void> {
    try {
      await ensurePrivateDirectory();
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const cutoff = now() - RETENTION_MS;
      await Promise.all(entries.map(async (entry) => {
        if (!entry.isFile() || !SCREENSHOT_NAME.test(entry.name)) return;
        const filePath = path.join(directory, entry.name);
        try {
          const stat = await fs.lstat(filePath);
          if (stat.isFile() && stat.mtimeMs < cutoff) await fs.unlink(filePath);
        } catch (_error) {
          // Cleanup is best-effort and must never block capture delivery.
        }
      }));
    } catch (_error) {
      // The subsequent write reports a typed warning with the real failure.
    }
  }

  async function attestManagedPath(filePath: string): Promise<string | null> {
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return null;

      const resolvedDirectory = path.resolve(directory);
      const resolvedPath = path.resolve(filePath);
      if (path.dirname(resolvedPath) !== resolvedDirectory
          || !SCREENSHOT_NAME.test(path.basename(resolvedPath))) {
        return null;
      }

      const beforeOpen = await fs.lstat(resolvedPath);
      if (!beforeOpen.isFile() || beforeOpen.isSymbolicLink()) return null;

      const [canonicalDirectory, canonicalPath] = await Promise.all([
        fs.realpath(resolvedDirectory),
        fs.realpath(resolvedPath),
      ]);
      if (path.dirname(canonicalPath) !== canonicalDirectory
          || !SCREENSHOT_NAME.test(path.basename(canonicalPath))) {
        return null;
      }

      handle = await fs.open(canonicalPath, 'r');
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== beforeOpen.dev || opened.ino !== beforeOpen.ino) {
        return null;
      }

      const signature = Buffer.alloc(PNG_SIGNATURE.length);
      const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
      if (bytesRead !== PNG_SIGNATURE.length || !signature.equals(PNG_SIGNATURE)) return null;
      return canonicalPath;
    } catch (_error) {
      return null;
    } finally {
      if (handle) {
        try { await handle.close(); } catch (_closeError) { /* best-effort */ }
      }
    }
  }

  async function write(imageData: string): Promise<ScreenshotWriteResult> {
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    let createdPath: string | null = null;
    try {
      const bytes = decodePngBase64(imageData);
      await cleanup();
      await ensurePrivateDirectory();
      const filename = `fsb-screenshot-${now()}-${uuid()}.png`;
      const filePath = path.join(directory, filename);
      createdPath = filePath;
      handle = await fs.open(filePath, 'wx', 0o600);
      await writeFile(handle, bytes);
      await handle.chmod(0o600);
      await handle.close();
      handle = null;
      return { filePath };
    } catch (error) {
      if (handle) {
        try { await handle.close(); } catch (_closeError) { /* best-effort */ }
      }
      if (createdPath) {
        try { await fs.unlink(createdPath); } catch (_unlinkError) { /* no file or best-effort cleanup */ }
      }
      return {
        filePath: null,
        warning: {
          code: 'SCREENSHOT_FILE_WRITE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  return { directory, cleanup, write, attestManagedPath };
}

export const screenshotStore = createScreenshotStore();
void screenshotStore.cleanup();
const cleanupTimer = setInterval(() => { void screenshotStore.cleanup(); }, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

export const screenshotStoreConstants = { RETENTION_MS, CLEANUP_INTERVAL_MS };
