import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { CACHE_DIR } from './proc.mjs';

export const DATASET_REPO = 'osunlp/Online-Mind2Web';
export const DATASET_REV = 'eacad896a84dc5b65e29b0b06e4699ab0544d701';
export const DATASET_FILE = 'Online_Mind2Web.json';
export const DATASET_CACHE_DIR = `${CACHE_DIR}/dataset`;
export const LEVELS = ['easy', 'medium', 'hard'];

const REQUIRED_FIELDS = ['task_id', 'confirmed_task', 'website', 'reference_length', 'level'];
const TASK_ID_PATTERN = /^[0-9a-f]{32}(_\d{6})?$/;

export function datasetUrl(rev = DATASET_REV) {
  return `https://huggingface.co/datasets/${DATASET_REPO}/resolve/${rev}/${DATASET_FILE}`;
}

export function cachePaths(rev = DATASET_REV, cacheDir = DATASET_CACHE_DIR) {
  return { json: `${cacheDir}/${rev}.json`, meta: `${cacheDir}/${rev}.meta.json` };
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export class DatasetAccessError extends Error {}

export async function localHfToken(env = process.env) {
  if (env.HF_TOKEN) return env.HF_TOKEN.trim();
  const files = [env.HF_TOKEN_PATH, path.join(env.HF_HOME ?? path.join(homedir(), '.cache/huggingface'), 'token'), path.join(homedir(), '.huggingface/token')].filter(Boolean);
  for (const file of files) {
    try { const token = (await readFile(file, 'utf8')).trim(); if (token) return token; } catch {}
  }
  return null;
}

function accessHelp() {
  return [
    `Accept the dataset terms at https://huggingface.co/datasets/${DATASET_REPO} (gated, auto-approved),`,
    'then sign in locally with hf auth login or set HF_TOKEN in the runner environment. A local downloaded JSON file is also accepted with --dataset.',
  ].join(' ');
}

export async function downloadDataset({
  rev = DATASET_REV,
  cacheDir = DATASET_CACHE_DIR,
  token,
  fetchImpl = globalThis.fetch,
} = {}) {
  token ??= await localHfToken();
  if (!token) {
    throw new DatasetAccessError(`HF_TOKEN is not set and ${DATASET_FILE}@${rev} is not cached. ${accessHelp()}`);
  }
  const url = datasetUrl(rev);
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (res.status === 401 || res.status === 403) {
    throw new DatasetAccessError(`Hugging Face refused ${url} (HTTP ${res.status}). ${accessHelp()}`);
  }
  if (!res.ok) {
    throw new Error(`Download of ${url} failed with HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tasks = parseTasks(buf.toString('utf8'));
  const paths = cachePaths(rev, cacheDir);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(`${paths.json}.tmp`, buf);
  await rename(`${paths.json}.tmp`, paths.json);
  const meta = {
    repo: DATASET_REPO,
    revision: rev,
    file: DATASET_FILE,
    url,
    sha256: sha256(buf),
    bytes: buf.length,
    task_count: tasks.length,
    fetched_at: new Date().toISOString(),
  };
  await writeFile(paths.meta, `${JSON.stringify(meta, null, 2)}\n`);
  return { path: paths.json, meta, tasks };
}

// Accepts the JSON array HF serves, and JSON Lines as a fallback.
export function parseTasks(text) {
  const trimmed = text.trim();
  let rows;
  if (trimmed.startsWith('[')) {
    rows = JSON.parse(trimmed);
  } else {
    rows = trimmed.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('dataset has no task rows');
  const seen = new Set();
  return rows.map((row, i) => {
    for (const field of REQUIRED_FIELDS) {
      if (row[field] === undefined || row[field] === null || row[field] === '') {
        throw new Error(`dataset row ${i} is missing ${field}`);
      }
    }
    const taskId = String(row.task_id);
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error(`dataset row ${i} has unexpected task_id ${taskId}`);
    if (seen.has(taskId)) throw new Error(`duplicate task_id ${taskId}`);
    seen.add(taskId);
    const referenceLength = Number(row.reference_length);
    if (!Number.isInteger(referenceLength) || referenceLength < 1) {
      throw new Error(`dataset row ${i} has non-integer reference_length ${row.reference_length}`);
    }
    if (!LEVELS.includes(String(row.level).toLowerCase())) throw new Error(`dataset row ${i} has invalid level`);
    if (!['http:', 'https:'].includes(new URL(row.website).protocol)) throw new Error(`dataset row ${i} has invalid website`);
    return {
      task_id: taskId,
      confirmed_task: String(row.confirmed_task),
      website: String(row.website),
      reference_length: referenceLength,
      level: String(row.level).toLowerCase(),
    };
  });
}

export async function readCachedDataset({ rev = DATASET_REV, cacheDir = DATASET_CACHE_DIR } = {}) {
  const paths = cachePaths(rev, cacheDir);
  if (!existsSync(paths.json)) return null;
  const buf = await readFile(paths.json);
  const digest = sha256(buf);
  let meta = null;
  if (!existsSync(paths.meta)) throw new Error('cached dataset is missing integrity metadata; re-download it');
  if (existsSync(paths.meta)) {
    meta = JSON.parse(await readFile(paths.meta, 'utf8'));
    if (meta.revision !== rev || meta.sha256 !== digest) {
      throw new Error(`cached dataset ${paths.json} does not match its recorded sha256 (${meta.sha256}); delete it and re-download`);
    }
  }
  return { path: paths.json, sha256: digest, meta, tasks: parseTasks(buf.toString('utf8')) };
}

export function isDatasetCached({ rev = DATASET_REV, cacheDir = DATASET_CACHE_DIR } = {}) {
  return existsSync(cachePaths(rev, cacheDir).json);
}

// Returns { tasks, source: { path, sha256, revision } }. A local datasetPath
// (used for dry runs and tests) bypasses the cache and the network entirely.
export async function loadTasks({
  rev = DATASET_REV,
  cacheDir = DATASET_CACHE_DIR,
  token,
  fetchImpl = globalThis.fetch,
  datasetPath,
} = {}) {
  if (datasetPath) {
    const buf = await readFile(datasetPath);
    return { tasks: parseTasks(buf.toString('utf8')), source: { path: datasetPath, sha256: sha256(buf), revision: null } };
  }
  const cached = await readCachedDataset({ rev, cacheDir });
  if (cached) return { tasks: cached.tasks, source: { path: cached.path, sha256: cached.sha256, revision: rev } };
  const fresh = await downloadDataset({ rev, cacheDir, token, fetchImpl });
  return { tasks: fresh.tasks, source: { path: fresh.path, sha256: fresh.meta.sha256, revision: rev } };
}

// Tasks replaced after the original release carry a _MMDDYY suffix.
export function suffixHistogram(tasks) {
  const hist = {};
  for (const t of tasks) {
    const m = t.task_id.match(/_(\d{6})$/);
    const key = m ? m[1] : '(none)';
    hist[key] = (hist[key] || 0) + 1;
  }
  return hist;
}

export function levelCounts(tasks) {
  const counts = {};
  for (const t of tasks) counts[t.level] = (counts[t.level] || 0) + 1;
  return counts;
}

export function summarize(tasks) {
  return {
    total: tasks.length,
    levels: levelCounts(tasks),
    suffixes: suffixHistogram(tasks),
    websites: new Set(tasks.map((t) => new URL(t.website).hostname)).size,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { tasks, source } = await loadTasks();
    console.log(JSON.stringify({ source, ...summarize(tasks) }, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
