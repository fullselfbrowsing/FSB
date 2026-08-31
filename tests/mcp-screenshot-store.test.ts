import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createScreenshotStore, screenshotStoreConstants } from '../mcp/src/screenshot-store.ts';

function pngBase64(): string {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(1, 16);
  bytes.writeUInt32BE(1, 20);
  return bytes.toString('base64');
}

function managedName(id = '00000000-0000-4000-8000-000000000001'): string {
  return `fsb-screenshot-123456789-${id}.png`;
}

test('MCP screenshot store creates private, uniquely named PNG files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-screenshot-store-'));
  try {
    const directory = path.join(root, 'screenshots');
    let sequence = 0;
    const store = createScreenshotStore({
      directory,
      now: () => 123456789,
      uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    });
    const first = await store.write(pngBase64());
    const second = await store.write(pngBase64());
    assert.ok(first.filePath && second.filePath);
    assert.notEqual(first.filePath, second.filePath);
    assert.equal(path.dirname(first.filePath!), directory);
    assert.equal(path.basename(first.filePath!).includes('example.com'), false);
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(first.filePath!)).mode & 0o777, 0o600);
    assert.deepEqual(await fs.readFile(first.filePath!), Buffer.from(pngBase64(), 'base64'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('managed screenshot attestation accepts only canonical store-owned PNG files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-screenshot-attest-'));
  try {
    const directory = path.join(root, 'screenshots');
    const store = createScreenshotStore({
      directory,
      now: () => 123456789,
      uuid: () => '00000000-0000-4000-8000-000000000001',
    });
    const written = await store.write(pngBase64());
    assert.ok(written.filePath);
    assert.equal(
      await store.attestManagedPath(written.filePath!),
      await fs.realpath(written.filePath!),
    );

    const malformedName = path.join(directory, 'managed-lookalike.png');
    await fs.writeFile(malformedName, Buffer.from(pngBase64(), 'base64'));
    assert.equal(await store.attestManagedPath(malformedName), null);

    const invalidPng = path.join(
      directory,
      managedName('00000000-0000-4000-8000-000000000002'),
    );
    await fs.writeFile(invalidPng, 'not a PNG');
    assert.equal(await store.attestManagedPath(invalidPng), null);

    const outside = path.join(
      root,
      managedName('00000000-0000-4000-8000-000000000003'),
    );
    await fs.writeFile(outside, Buffer.from(pngBase64(), 'base64'));
    assert.equal(await store.attestManagedPath(outside), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('managed screenshot attestation rejects symlinks', {
  skip: process.platform === 'win32' ? 'symlink creation requires elevated privileges on Windows' : false,
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-screenshot-symlink-'));
  try {
    const directory = path.join(root, 'screenshots');
    await fs.mkdir(directory);
    const target = path.join(root, 'target.png');
    await fs.writeFile(target, Buffer.from(pngBase64(), 'base64'));
    const link = path.join(directory, managedName());
    await fs.symlink(target, link);
    const store = createScreenshotStore({ directory });
    assert.equal(await store.attestManagedPath(link), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cleanup deletes only matching regular files older than seven days', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-screenshot-cleanup-'));
  try {
    const now = Date.now();
    const store = createScreenshotStore({ directory: root, now: () => now });
    const old = path.join(root, 'fsb-screenshot-1-00000000-0000-4000-8000-000000000001.png');
    const unrelated = path.join(root, 'keep-me.png');
    await fs.writeFile(old, Buffer.from(pngBase64(), 'base64'));
    await fs.writeFile(unrelated, 'keep');
    const oldDate = new Date(now - screenshotStoreConstants.RETENTION_MS - 1000);
    await fs.utimes(old, oldDate, oldDate);
    await store.cleanup();
    await assert.rejects(fs.stat(old), { code: 'ENOENT' });
    assert.equal((await fs.readFile(unrelated, 'utf8')), 'keep');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('write failure preserves native-image delivery through a typed warning', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-screenshot-failure-'));
  try {
    const blocker = path.join(root, 'not-a-directory');
    await fs.writeFile(blocker, 'block');
    const result = await createScreenshotStore({ directory: blocker }).write(pngBase64());
    assert.equal(result.filePath, null);
    assert.equal(result.warning?.code, 'SCREENSHOT_FILE_WRITE_FAILED');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('partial write failures remove the incomplete managed PNG', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-screenshot-partial-'));
  try {
    const store = createScreenshotStore({
      directory: root,
      now: () => 123,
      uuid: () => '00000000-0000-4000-8000-000000000009',
      writeFile: async (handle, bytes) => {
        await handle.writeFile(bytes.subarray(0, 8));
        throw new Error('simulated partial write');
      },
    });
    const result = await store.write(pngBase64());
    assert.equal(result.filePath, null);
    assert.equal(result.warning?.code, 'SCREENSHOT_FILE_WRITE_FAILED');
    assert.deepEqual(await fs.readdir(root), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
