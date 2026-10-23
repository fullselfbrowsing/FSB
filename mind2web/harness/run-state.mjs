import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';

export function failureClass(final) {
  const error = final.error ?? '';
  if (/usage.limit|session limit|rate.limit|quota|429|insufficient_quota|usage_limit_reached|hit your.*limit|limit.*resets/i.test(error)) return 'quota';
  if (final.cleanup_ok === false || final.outcome === 'rig_failure') return 'infrastructure';
  if (final.outcome === 'never_started') return 'startup';
  return 'task';
}

export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, file);
}

export async function acquireRunLock(runDir) {
  const file = path.join(runDir, '.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }));
      return async () => { await handle.close(); await unlink(file).catch(() => {}); };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let recovery;
      try { recovery = await open(file + '.recovery', 'wx'); }
      catch (error) { if (error.code === 'EEXIST') throw new Error('Another process is recovering the run lock'); throw error; }
      try {
        let owner;
        try { owner = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error('Run lock is unreadable; inspect it before removing it'); }
        if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('Run lock has an invalid owner');
        try { process.kill(owner.pid, 0); throw new Error('Run is already active in process ' + owner.pid); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
        await unlink(file);
      } finally { await recovery.close(); await unlink(file + '.recovery').catch(() => {}); }
    }
  }
  throw new Error('Unable to acquire run lock');
}

export function refreshRunState(manifest) {
  const rows = new Map(manifest.outcomes.map(row => [row.task_id, row]));
  manifest.expected = manifest.task_ids.length;
  manifest.attempted = manifest.task_ids.filter(id => rows.has(id)).length;
  manifest.exported = manifest.task_ids.filter(id => rows.get(id)?.exported).length;
  manifest.pending_ids = manifest.task_ids.filter(id => !rows.has(id));
  manifest.collection_complete = manifest.pending_ids.length === 0;
  return manifest;
}
