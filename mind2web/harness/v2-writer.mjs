// Converts one run's raw logs (proxy steps.jsonl, driver final.json) into an
// Online-Mind2Web v2 submission directory: <outDir>/<task_id>/result.json plus
// trajectory/NNNN.png, one screenshot file per step.
//
// Screenshots are taken by the proxy after each action, so a step's
// screenshot and url both describe the page state the action produced. For
// NAVIGATE that makes url the destination, as the README requires.

import { readFile, mkdir, copyFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPng } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ALLOWLIST_PATH = path.resolve(HERE, '../config/tool-allowlist.json');

export const SCHEMA_VERSION = 'online-mind2web-v2';
export const TASK_ID_PATTERN = /^[A-Za-z0-9_\-]+$/;

// Used only when config/tool-allowlist.json does not exist.
export const FALLBACK_ALLOWLIST = {
  version: 1,
  actions: {
    navigate: { verb: 'NAVIGATE' },
    click: { verb: 'CLICK' },
    check_box: { verb: 'CLICK' },
    type_text: { verb: 'TYPE' },
    press_enter: { verb: 'PRESS_KEY' },
    select_option: { verb: 'SELECT' },
    hover: { verb: 'HOVER' },
    scroll: { verb: 'SCROLL' },
    scroll_to_element: { verb: 'SCROLL' },
    scroll_to_top: { verb: 'SCROLL' },
    scroll_to_bottom: { verb: 'SCROLL' },
    go_back: { verb: 'GO_BACK' },
    go_forward: { verb: 'GO_FORWARD' },
    refresh: { verb: 'REFRESH' },
  },
  reads: ['read_page', 'get_text', 'get_page_snapshot'],
  bootstrap: { open_tab: true, capture_screenshot: true },
};

const PAGE_VERBS = new Set(['NAVIGATE', 'GO_BACK', 'GO_FORWARD', 'REFRESH']);
const MAX_TARGET_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_TYPED_CHARS = 500;

export class WriterError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function loadAllowlist(allowlistPath = DEFAULT_ALLOWLIST_PATH) {
  if (!existsSync(allowlistPath)) return { allowlist: FALLBACK_ALLOWLIST, source: 'fallback' };
  const allowlist = JSON.parse(await readFile(allowlistPath, 'utf8'));
  if (!allowlist || typeof allowlist.actions !== 'object') {
    throw new WriterError('BAD_ALLOWLIST', `${allowlistPath} has no "actions" object`);
  }
  return { allowlist, source: allowlistPath };
}

// Truncates by code point so surrogate pairs are never split.
function truncate(text, max) {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max).join('')}… (+${chars.length - max} chars)`;
}

// Action strings are one line each in the judge prompt.
function oneLine(value, max) {
  const flat = String(value).replace(/\s+/g, ' ').trim();
  return truncate(flat, max);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function describeTarget(args) {
  const selector = nonEmptyString(args.selector) ?? nonEmptyString(args.ref);
  if (selector) return oneLine(selector, MAX_TARGET_CHARS);
  const text = nonEmptyString(args.text);
  if (text) return `text=${JSON.stringify(oneLine(text, MAX_TARGET_CHARS))}`;
  return 'page';
}

function scrollDescription(tool, args) {
  if (tool === 'scroll_to_top') return 'scroll to the top of the page';
  if (tool === 'scroll_to_bottom') return 'scroll to the bottom of the page';
  if (tool === 'scroll_to_element') return 'scroll the element into view';
  const direction = args.direction === 'up' ? 'up' : 'down';
  const amount = Number.isFinite(args.amount) ? ` ${args.amount}px` : ' one viewport';
  return `scroll ${direction}${amount}`;
}

// Builds the Grammar A action string for one logged action.
export function formatAction(tool, verb, args, ok, reason, executionOutcome) {
  const status = executionOutcome === 'unknown' ? 'UNKNOWN' : ok ? 'SUCCESS' : 'FAILED';
  switch (verb) {
    case 'NAVIGATE': {
      return `page -> NAVIGATE -> navigate to the requested page | ${status}`;
    }
    case 'TYPE': {
      const typed = truncate(String(args.text ?? ''), MAX_TYPED_CHARS);
      return `TYPE ${describeTarget(args)} -> ${JSON.stringify(typed)} | ${status}`;
    }
    case 'SELECT': {
      const value = oneLine(args.value ?? '', MAX_DESCRIPTION_CHARS);
      return `SELECT ${describeTarget(args)} -> select ${JSON.stringify(value)} | ${status}`;
    }
    case 'SCROLL': {
      const target = tool === 'scroll_to_element' ? describeTarget(args) : 'page';
      return `SCROLL ${target} -> ${scrollDescription(tool, args)} | ${status}`;
    }
    case 'PRESS_KEY': {
      const modifiers = ['ctrl', 'shift', 'alt'].filter(key => args[key]).map(key => key[0].toUpperCase() + key.slice(1));
      return `PRESS_KEY ${describeTarget(args)} -> press ${[...modifiers, tool === 'press_enter' ? 'Enter' : args.key ?? 'Enter'].join('+')} | ${status}`;
    }
    case 'EXECUTE_JS':
      return `EXECUTE_JS page -> ${JSON.stringify(oneLine(args.code ?? '', 2000))} | ${status}`;
    case 'CLICK_AT': case 'DOUBLE_CLICK_AT': case 'SCROLL_AT': case 'DRAG': case 'DRAG_DROP': case 'DRAG_VARIABLE_SPEED': case 'HOLD':
    case 'OPEN_TAB': case 'CLOSE_TAB': case 'SWITCH_TAB': case 'FILL_SHEET': case 'READ_SHEET': case 'SELECT_TEXT_RANGE':
    case 'SET_ATTRIBUTE': case 'INSERT_TEXT': case 'CLEAR': case 'SEARCH': {
      const details = Object.fromEntries(Object.entries(args).filter(([key]) => !['client', 'visual_reason', 'is_final'].includes(key)));
      return `${verb} -> ${oneLine(JSON.stringify(details), 2500)} | ${status}`;
    }
    default: {
      if (PAGE_VERBS.has(verb)) {
        const fallback = { GO_BACK: 'browser back', GO_FORWARD: 'browser forward', REFRESH: 'reload the page' }[verb];
        return `page -> ${verb} -> ${fallback} | ${status}`;
      }
      const fallback = `${verb.toLowerCase()} the element`;
      return `${verb} ${describeTarget(args)} -> ${fallback} | ${status}`;
    }
  }
}

function asUrl(value) {
  if (!nonEmptyString(value)) return null;
  try {
    new URL(value);
    return value;
  } catch {
    return null;
  }
}

async function readSteps(rawDir, warnings) {
  const file = path.join(rawDir, 'steps.jsonl');
  if (!existsSync(file)) throw new WriterError('NO_STEP_LOG', `missing ${file}`);
  const lines = (await readFile(file, 'utf8')).split('\n');
  const steps = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      steps.push(JSON.parse(line));
    } catch {
      throw new WriterError('BAD_STEP_LOG', `steps.jsonl line ${i + 1} is not valid JSON`);
    }
  });
  for (let i = 1; i < steps.length; i++) {
    if (!(steps[i].seq > steps[i - 1].seq)) {
      throw new WriterError('BAD_STEP_ORDER', `steps.jsonl seq is not increasing at seq ${steps[i].seq}`);
    }
  }
  return steps;
}

async function readJsonIfPresent(file) {
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf8'));
}

// Returns the absolute path when the file is a non-empty, structurally valid PNG.
async function usableScreenshot(entry) {
  const p = entry.screenshot_path;
  if (!nonEmptyString(p)) return { path: null, why: entry.screenshot_error || 'no screenshot recorded' };
  try {
    const info = await stat(p);
    if (!info.isFile() || info.size === 0) return { path: null, why: `${p} is empty or not a file` };
    const check = inspectPng(await readFile(p));
    if (!check.ok) return { path: null, why: `${p}: ${check.error}` };
    return { path: p, why: null };
  } catch (err) {
    return { path: null, why: `${p}: ${err.code || err.message}` };
  }
}

function validateTask(task) {
  if (!task || typeof task !== 'object') throw new WriterError('BAD_TASK', 'task is required');
  if (typeof task.task_id !== 'string' || !TASK_ID_PATTERN.test(task.task_id)) {
    throw new WriterError('BAD_TASK', `task_id ${JSON.stringify(task.task_id)} does not match ${TASK_ID_PATTERN}`);
  }
  if (!nonEmptyString(task.confirmed_task)) throw new WriterError('BAD_TASK', 'confirmed_task is empty');
  if (!Number.isInteger(task.reference_length) || task.reference_length < 1) {
    throw new WriterError('BAD_TASK', `reference_length ${JSON.stringify(task.reference_length)} is not a positive integer`);
  }
}

export async function writeV2({ task, rawDir, outDir, allowlistPath = DEFAULT_ALLOWLIST_PATH }) {
  validateTask(task);
  const warnings = [];
  const { allowlist } = await loadAllowlist(allowlistPath);
  const entries = await readSteps(rawDir, warnings);
  const meta = await readJsonIfPresent(path.join(rawDir, 'proxy-meta.json'));
  const final = await readJsonIfPresent(path.join(rawDir, 'final.json'));
  if (!final) warnings.push('final.json is missing; treating the final answer as null');

  // A proxy that fills in a missing visual_reason can record its filler here
  // so it is not presented as the agent's own reasoning.
  const fillerReason = nonEmptyString(meta?.default_visual_reason);
  const reasonOf = (args) => {
    const reason = nonEmptyString(args?.visual_reason);
    return reason && reason !== fillerReason ? reason.trim() : null;
  };

  const bootstrap = entries.find((e) => e.kind === 'bootstrap' && e.tool === 'open_tab')
    ?? entries.find((e) => e.kind === 'bootstrap');
  if (!bootstrap) throw new WriterError('NO_BOOTSTRAP', 'steps.jsonl has no bootstrap entry');
  const bootShot = await usableScreenshot(bootstrap);
  if (!bootShot.path) {
    throw new WriterError('NO_BOOTSTRAP_SCREENSHOT', `bootstrap screenshot unusable: ${bootShot.why}`);
  }

  const startUrl = asUrl(bootstrap.args?.url) ?? asUrl(meta?.start_url) ?? asUrl(task.website);
  const records = [];
  records.push({
    source: bootShot.path,
    url: asUrl(bootstrap.url) ?? startUrl,
    action: formatAction('navigate', 'NAVIGATE', {}, bootstrap.ok !== false, null),
    action_status: bootstrap.ok === false ? 'FAILED' : 'SUCCESS',
    thought: null,
  });
  if (bootstrap.ok === false) warnings.push(`bootstrap open_tab failed: ${bootstrap.error ?? 'unknown error'}`);

  let lastShot = bootShot.path;
  let lastUrl = records[0].url;
  const excluded = { read: [], denied: [], other: [] };

  for (const entry of entries) {
    if (entry === bootstrap) continue;
    if (entry.kind === 'read' || entry.kind === 'capture') {
      const shot = await usableScreenshot(entry);
      if (!shot.path) throw new WriterError('MISSING_READ_SCREENSHOT', `seq ${entry.seq} (${entry.tool}): screenshot unusable (${shot.why})`);
      lastShot = shot.path;
      lastUrl = asUrl(entry.url) ?? lastUrl;
      excluded.read.push(entry.seq);
      continue;
    }
    if (entry.kind === 'denied') { excluded.denied.push(`${entry.seq}:${entry.tool}`); continue; }
    if (entry.kind === 'research_read') { excluded.other.push(`${entry.seq}:${entry.kind}`); continue; }
    if (entry.kind !== 'action') { excluded.other.push(`${entry.seq}:${entry.kind}`); continue; }

    const verb = allowlist.actions[entry.tool]?.verb;
    if (!verb) {
      throw new WriterError('UNKNOWN_ACTION', `seq ${entry.seq}: tool ${entry.tool} has no verb in the allowlist`);
    }
    const args = entry.args && typeof entry.args === 'object' ? entry.args : {};
    const ok = entry.ok === true;
    const shot = await usableScreenshot(entry);
    if (!shot.path) {
      throw new WriterError('MISSING_ACTION_SCREENSHOT', `seq ${entry.seq} (${entry.tool}): screenshot unusable (${shot.why})`);
    }
    const source = shot.path ?? lastShot;
    let url = asUrl(entry.url);
    if (!url && verb === 'NAVIGATE' && ok) url = asUrl(args.url);
    if (nonEmptyString(entry.url) && !url) warnings.push(`seq ${entry.seq}: url ${JSON.stringify(entry.url)} is not absolute; set to null`);
    records.push({
      source,
      url,
      action: formatAction(entry.tool, verb, args, ok, reasonOf(args), entry.execution_outcome),
      action_status: entry.execution_outcome === 'unknown' ? null : ok ? 'SUCCESS' : 'FAILED',
      thought: reasonOf(args),
    });
    lastShot = source;
    if (url) lastUrl = url;
  }

  if (excluded.read.length) warnings.push(`excluded ${excluded.read.length} read call(s) from action_history (seq ${excluded.read.join(', ')})`);
  if (excluded.denied.length) warnings.push(`excluded ${excluded.denied.length} denied call(s) from action_history (${excluded.denied.join(', ')})`);
  if (excluded.other.length) warnings.push(`excluded ${excluded.other.length} other log entr(ies) (${excluded.other.join(', ')})`);

  const rawAnswer = final && typeof final.final_answer === 'string' ? final.final_answer : null;
  if (rawAnswer === null) {
    warnings.push(`no final answer (outcome ${final?.outcome ?? 'unknown'}); agent_final_answer is null`);
  } else if (final.outcome && final.outcome !== 'complete') {
    warnings.push(`outcome is ${final.outcome} but a final answer was present; it was kept`);
  }
  records.push({
    source: lastShot,
    url: lastUrl,
    action: rawAnswer === null ? 'TASK_COMPLETE -> ANSWER:' : `TASK_COMPLETE -> ANSWER: ${rawAnswer}`,
    action_status: null,
    thought: null,
  });

  if (records.length > 50) warnings.push('More than 50 frames: upstream WebJudge retains at most the first 50 qualifying images');

  const dir = path.join(outDir, task.task_id);
  const trajDir = path.join(dir, 'trajectory');
  await rm(dir, { recursive: true, force: true });
  await mkdir(trajDir, { recursive: true });

  const actionHistory = [];
  for (const [i, rec] of records.entries()) {
    const name = `${String(i).padStart(4, '0')}.png`;
    await copyFile(rec.source, path.join(trajDir, name));
    actionHistory.push({
      step: i,
      screenshot: name,
      url: rec.url,
      action: rec.action,
      action_status: rec.action_status,
      thought: rec.thought,
    });
  }

  const result = {
    schema_version: SCHEMA_VERSION,
    task: task.confirmed_task,
    task_id: task.task_id,
    agent_final_answer: rawAnswer,
    reference_length: task.reference_length,
    action_history: actionHistory,
  };
  const resultPath = path.join(dir, 'result.json');
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return { dir, resultPath, steps: actionHistory.length, warnings };
}
