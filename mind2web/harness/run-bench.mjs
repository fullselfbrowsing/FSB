import { mkdir, readFile, appendFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { BENCH_ROOT, HARNESS_DIR, REPO_ROOT, RESULTS_DIR, runCommand } from './proc.mjs';
import { loadTasks, sha256, DATASET_REV } from './dataset.mjs';
import { selectTasks } from './sample.mjs';
import { preflight } from './preflight.mjs';
import { checkFocus } from './focus.mjs';
import { launchChrome, seedExtensionStorage, dismissDialogs, closeTaskTabs } from './chrome.mjs';
import { runClaudeTask } from './driver-claude-code.mjs';
import { runCodexTask } from './driver-codex.mjs';
import { writeV2 } from './v2-writer.mjs';
import { validateTrajectoryDir } from './validate-v2.mjs';
import { StdioClient } from './mcp-client.mjs';
import { atomicJson, acquireRunLock, failureClass, refreshRunState } from './run-state.mjs';
import { writeReport } from './report.mjs';
import { waitForResource, modelReady } from './readiness.mjs';
import { runJudgeJobs, JUDGE_PROTOCOL } from './judge-jobs.mjs';
import { hashTree } from './fingerprint.mjs';

export function options(argv) {
  const { values } = parseArgs({ args: argv, options: {
    'dry-run': { type: 'boolean', default: false }, 'real-agent': { type: 'boolean', default: false }, judge: { type: 'boolean', default: false },
    resume: { type: 'boolean', default: false }, 'run-id': { type: 'string' }, tasks: { type: 'string', default: 'pilot' },
    dataset: { type: 'string' }, count: { type: 'string', default: '30' }, seed: { type: 'string', default: 'om2w-v1' },
    driver: { type: 'string', default: 'claude' }, browser: { type: 'string', default: 'isolated' }, model: { type: 'string' }, effort: { type: 'string', default: 'medium' },
    'max-turns': { type: 'string', default: '60' }, 'max-actions': { type: 'string', default: '60' }, 'timeout-seconds': { type: 'string', default: '600' },
    'budget-usd': { type: 'string', default: '5' }, chrome: { type: 'string' }, 'fsb-server-cmd': { type: 'string' },
    'wait-for-resources': { type: 'boolean', default: false }, 'wait-seconds': { type: 'string', default: '60' }, 'judge-passes': { type: 'string', default: '3' },
  } });
  values['run-id'] ??= `${values['dry-run'] ? 'dryrun' : 'run'}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (!/^[A-Za-z0-9_-]+$/.test(values['run-id'])) throw new Error('Invalid run ID');
  if (!['claude', 'codex'].includes(values.driver)) throw new Error('Invalid driver');
  if (!['existing', 'isolated'].includes(values.browser)) throw new Error('Invalid browser mode');
  values.model ??= values.driver === 'codex' ? 'gpt-6.1-sol' : 'claude-opus-5-5';
  for (const key of ['count', 'max-turns', 'max-actions', 'timeout-seconds', 'wait-seconds', 'judge-passes']) {
    if (!Number.isInteger(Number(values[key])) || Number(values[key]) < 1) throw new Error(`--${key} must be a positive integer`);
  }
  if (!(Number(values['budget-usd']) > 0)) throw new Error('--budget-usd must be positive');
  return values;
}

export async function runScriptedTask(task, rawDir, serverCommand, env = process.env) {
  const client = new StdioClient([process.execPath, path.join(HARNESS_DIR, 'mcp-record-proxy.mjs'), '--', ...serverCommand], {
    env: { ...env, OM2W_RAW_DIR: rawDir, OM2W_START_URL: task.website },
  });
  try {
    await client.initialize(); await client.request('tools/list');
    for (const [name, args] of [['read_page', {}], ['click', { selector: '#blue-widget', visual_reason: 'Inspect the listed Blue Widget' }], ['get_text', { selector: '#price' }]]) {
      const result = await client.request('tools/call', { name, arguments: args });
      if (result.isError) throw new Error(JSON.stringify(result));
    }
    const final = { task_id: task.task_id, model: 'scripted-fixture', final_answer: 'The Blue Widget costs $19.99.', outcome: 'complete',
      num_turns: 3, duration_ms: 0, usage: null, total_cost_usd: 0, session_id: null, error: null, synthetic: true };
    await atomicJson(path.join(rawDir, 'final.json'), final);
    return final;
  } finally { await client.close(); }
}

export async function runBench(o, dependencies = {}) {
  const dry = o['dry-run'];
  const signal = dependencies.signal;
  const inspect = dependencies.preflight ?? preflight;
  const sleep = dependencies.wait ?? waitForResource;
  const run = dependencies.runCommand ?? runCommand;
  const drivers = { claude: runClaudeTask, codex: runCodexTask, ...dependencies.drivers };
  const createHub = dependencies.createHub ?? (command => new StdioClient(command));
  const runDir = path.join(dependencies.resultsDir ?? RESULTS_DIR, o['run-id']);
  await mkdir(runDir, { recursive: true });
  const releaseLock = await acquireRunLock(runDir);
  const manifestPath = path.join(runDir, 'manifest.json');
  let browser, hub, manifest;
  async function checkpoint() {
    manifest.updated_at = new Date().toISOString();
    if (manifest.task_ids.length) refreshRunState(manifest);
    await atomicJson(manifestPath, manifest);
    await writeReport(runDir, manifest);
  }
  async function pause(state, error) {
    manifest.state = state;
    manifest.last_error = error;
    manifest.next_check_at = o['wait-for-resources'] ? new Date(Date.now() + Number(o['wait-seconds']) * 1000).toISOString() : null;
    await checkpoint();
    console.log(JSON.stringify({ state, error, pending: manifest.pending_ids?.length ?? manifest.expected, next_check_at: manifest.next_check_at }));
    if (!o['wait-for-resources'] || signal?.aborted) return false;
    await sleep(Number(o['wait-seconds']) * 1000, signal);
    return !signal?.aborted;
  }
  async function health(sourcePath) {
    const checks = await inspect({ full: o.tasks === 'all', chromePath: o.chrome, datasetPath: sourcePath,
      browserMode: o.browser, driver: o.driver, serverCommand: manifest.server_command, checkDataset: false });
    await atomicJson(path.join(runDir, 'preflight.json'), checks);
    return checks;
  }
  async function recover(failure, error, sourcePath) {
    if (!(await pause(failure === 'quota' ? 'waiting_for_quota' : 'waiting_for_browser', error))) return false;
    if (failure === 'quota') {
      while (!signal?.aborted) {
        const ready = await (dependencies.modelReady ?? modelReady)({ driver: o.driver, model: o.model, effort: o.effort, signal });
        await appendFile(path.join(runDir, 'resource-probes.jsonl'), JSON.stringify(ready) + '\n');
        if (ready.ok) break;
        if (!(await pause('waiting_for_quota', 'Model subscription remains unavailable'))) return false;
      }
    }
    if (!dry) while (!signal?.aborted) {
      const checks = await health(sourcePath);
      if (checks.ok) break;
      if (!(await pause('waiting_for_browser', checks.checks.filter(c => !c.ok).map(c => c.detail).join('; ')))) return false;
    }
    return !signal?.aborted;
  }
  try {
    if (existsSync(manifestPath) && !o.resume) throw new Error('Run already exists; use --resume or a new --run-id');
    if (o.resume && !existsSync(manifestPath)) throw new Error('No manifest to resume');
    const nativeEntry = path.join(homedir(), '.fsb/native-host/runtime/package/build/index.js');
    const serverCommand = dry ? [process.execPath, path.join(HARNESS_DIR, 'stub-fsb-server.mjs')] : o['fsb-server-cmd'] ? JSON.parse(o['fsb-server-cmd']) :
      o.browser === 'existing' && existsSync(nativeEntry) ? [process.execPath, nativeEntry, 'stdio'] : ['npx', '-y', 'fsb-mcp-server@0.11.2', 'stdio'];
    if (!Array.isArray(serverCommand) || !serverCommand.length || serverCommand.some(v => typeof v !== 'string')) throw new Error('Invalid FSB server command');
    const commit = await run('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT });
    const names = (await readdir(HARNESS_DIR)).filter(name => name.endsWith('.mjs') || name.endsWith('.py')).sort();
    const harnessSource = Buffer.concat(await Promise.all(names.map(async name => Buffer.concat([Buffer.from(name), await readFile(path.join(HARNESS_DIR, name))]))));
    const judgeFiles = ['om2w_judge/runner.py', 'om2w_judge/engines.py', 'upstream/src/methods/webjudge_online_mind2web.py', 'upstream/src/utils.py', 'requirements.lock.txt'];
    const judgeSource = Buffer.concat(await Promise.all(judgeFiles.map(name => readFile(path.join(BENCH_ROOT, 'judge', name)))));
    const provenancePath = path.join(runDir, 'provenance.json');
    const provenance = existsSync(provenancePath) ? await readFile(provenancePath) : null;
    const config = { format_version: 2, synthetic: dry, scripted: dry && !o['real-agent'], driver: o.driver, browser: o.browser,
      model: o.model, effort: o.effort, max_turns: Number(o['max-turns']), max_actions: Number(o['max-actions']), timeout_seconds: Number(o['timeout-seconds']),
      budget_usd: o.driver === 'claude' ? Number(o['budget-usd']) : null, seed: o.seed, task_selection: o.tasks, count: Number(o.count),
      judge_passes: Number(o['judge-passes']), judge_protocol: JUDGE_PROTOCOL, server_command: serverCommand, fsb_commit: commit.stdout.trim(), harness_sha256: sha256(harnessSource),
      judge_sha256: sha256(judgeSource),
      provenance_sha256: provenance ? sha256(provenance) : null,
      fsb_runtime_sha256: !dry && serverCommand[1]?.endsWith('/build/index.js') && existsSync(serverCommand[1]) ? await hashTree(path.dirname(serverCommand[1])) : null,
      allowlist_sha256: sha256(await readFile(path.join(BENCH_ROOT, 'config/tool-allowlist.json'))),
      agent_prompt_sha256: sha256(await readFile(path.join(BENCH_ROOT, 'config/agent-prompt.md'))) };
    manifest = o.resume ? JSON.parse(await readFile(manifestPath, 'utf8')) : { ...config, started_at: new Date().toISOString(),
      source: { revision: dry ? null : DATASET_REV, sha256: null }, task_ids: [], outcomes: [], attempts: [],
      expected: dry ? 1 : o.tasks === 'all' ? 300 : Number(o.count), state: 'initializing', provenance: provenance ? JSON.parse(provenance) : null };
    if (o.resume) for (const key of Object.keys(config)) if (JSON.stringify(config[key]) !== JSON.stringify(manifest[key])) throw new Error(`Cannot resume: ${key} changed`);
    if (!dry && o.browser === 'existing' && !manifest.collection_complete) {
      while (!signal?.aborted) {
        try { hub = createHub(serverCommand); await hub.initialize(); break; }
        catch (err) {
          if (hub) await hub.close(); hub = null;
          if (!(await pause('waiting_for_browser', err.message))) return { runDir, manifest };
        }
      }
    }
    let loaded;
    while (!signal?.aborted) {
      try {
        loaded = dry ? { tasks: [{ task_id: '00000000000000000000000000000001', confirmed_task: 'Find the price of the Blue Widget.', website: 'https://store.example/', reference_length: 2, level: 'easy' }], source: { revision: null, sha256: null, synthetic: true } } : await (dependencies.loadTasks ?? loadTasks)({ datasetPath: o.dataset });
        break;
      } catch (err) { if (!(await pause('waiting_for_dataset', err.message))) return { runDir, manifest }; }
    }
    if (!loaded) { manifest.state = 'paused'; await checkpoint(); return { runDir, manifest }; }
    if (!dry && o.tasks === 'all' && loaded.tasks.length !== 300) throw new Error(`Full benchmark requires exactly 300 tasks; got ${loaded.tasks.length}`);
    const ids = ['pilot', 'all'].includes(o.tasks) ? undefined : JSON.parse(await readFile(o.tasks, 'utf8'));
    const selected = o.tasks === 'all' ? loaded.tasks : selectTasks(loaded.tasks, { count: dry ? 1 : Number(o.count), seed: o.seed, ids });
    const selectedIds = selected.map(task => task.task_id);
    if (manifest.task_ids.length && (JSON.stringify(manifest.task_ids) !== JSON.stringify(selectedIds) || manifest.source.sha256 !== loaded.source.sha256 || manifest.source.revision !== loaded.source.revision)) throw new Error('Cannot resume: dataset or selected IDs changed');
    manifest.source = loaded.source; manifest.task_ids = selectedIds;
    await atomicJson(path.join(runDir, 'task-ids.json'), selectedIds);
    await checkpoint();
    const env = { ...process.env };
    if (dry) {
      const shot = path.join(runDir, 'synthetic-store.png');
      const result = await run(path.join(BENCH_ROOT, 'judge/.venv/bin/python'), [path.join(HARNESS_DIR, 'fixture-image.py'), shot]);
      if (result.code !== 0) throw new Error('Could not render synthetic fixture: ' + result.stderr);
      env.OM2W_STUB_SCREENSHOT = shot;
    } else if (selected.some(task => !manifest.outcomes.some(row => row.task_id === task.task_id))) {
      while (!signal?.aborted) {
        const checks = await health(loaded.source.path);
        if (checks.ok) {
          manifest.preflight = checks;
          if (o.browser === 'isolated') {
            const auth = JSON.parse(await readFile(path.join(homedir(), '.fsb/bridge-auth.json'), 'utf8'));
            if (!auth.allowedExtensionOrigin || !auth.sessionSecret) throw new Error('Live rig needs an existing FSB bridge pairing');
            hub = createHub(serverCommand); await hub.initialize();
            browser = await launchChrome({ chromePath: checks.chromePath, extensionDir: path.join(REPO_ROOT, 'extension'), userDataDir: path.join(runDir, 'chrome-profile') });
            await seedExtensionStorage(browser.cdp, `fsb-auth.${auth.sessionSecret}`, auth.allowedExtensionOrigin); await dismissDialogs(browser.cdp);
            manifest.chrome_version = browser.version;
          }
          break;
        }
        if (!(await pause('waiting_for_browser', checks.checks.filter(c => !c.ok).map(c => `${c.name}: ${c.detail}`).join('; ')))) return { runDir, manifest };
      }
    }
    for (const task of selected) {
      if (signal?.aborted) break;
      if (manifest.outcomes.some(row => row.task_id === task.task_id)) continue;
      const previous = manifest.attempts.filter(row => row.task_id === task.task_id).at(-1);
      if (previous?.processed && previous.failure_class !== 'task' && manifest.attempts.filter(row => row.task_id === task.task_id).length < 2) {
        if (!(await recover(previous.failure_class, previous.final.error, loaded.source.path))) return { runDir, manifest };
      }
      while (!signal?.aborted && !manifest.outcomes.some(row => row.task_id === task.task_id)) {
        const attempts = manifest.attempts.filter(row => row.task_id === task.task_id);
        let attempt = attempts.at(-1);
        let final;
        if (attempt && !attempt.processed) {
          final = await readFile(path.join(attempt.raw_dir, 'final.json'), 'utf8').then(JSON.parse).catch(() => ({ outcome: 'rig_failure', error: 'Task controller interrupted before writing a final result' }));
        } else {
          if (attempts.length >= 2) { manifest.state = 'paused_retry_exhausted'; manifest.last_error = `Infrastructure retries exhausted for ${task.task_id}`; await checkpoint(); return { runDir, manifest }; }
          const rawDir = path.join(runDir, 'raw', task.task_id, `attempt-${attempts.length + 1}`);
          await mkdir(rawDir, { recursive: true });
          attempt = { task_id: task.task_id, index: attempts.length + 1, raw_dir: rawDir, state: 'running', started_at: new Date().toISOString() };
          manifest.attempts.push(attempt); manifest.state = 'running'; manifest.current_task_id = task.task_id;
          await checkpoint();
          if (!dry && o.browser === 'isolated' && !(await checkFocus()).ok) final = { outcome: 'rig_failure', error: 'Chrome for Testing must be frontmost' };
          else final = dry && !o['real-agent'] ? await runScriptedTask(task, rawDir, serverCommand, env) : await drivers[o.driver]({ task, rawDir, serverCommand,
            model: o.model, effort: o.effort, maxTurns: Number(o['max-turns']), maxActions: Number(o['max-actions']), timeoutMs: Number(o['timeout-seconds']) * 1000, budgetUsd: Number(o['budget-usd']), env, signal });
        }
        if (signal?.aborted) final = { ...final, outcome: 'rig_failure', final_answer: null, error: 'Task controller interrupted; partial attempt retained' };
        attempt.state = 'finished'; attempt.final = final; attempt.ended_at = new Date().toISOString(); attempt.processed = true;
        await atomicJson(path.join(attempt.raw_dir, 'final.json'), final);
        const failure = failureClass(final); attempt.failure_class = failure;
        await appendFile(path.join(runDir, 'attempts.jsonl'), JSON.stringify(attempt) + '\n');
        if (failure !== 'task') {
          await checkpoint();
          if (manifest.attempts.filter(row => row.task_id === task.task_id).length >= 2) { manifest.state = 'paused_retry_exhausted'; await checkpoint(); return { runDir, manifest }; }
          if (!(await recover(failure, final.error, loaded.source.path))) return { runDir, manifest };
          continue;
        }
        const row = { task_id: task.task_id, outcome: final.outcome, exported: false, selected_attempt: attempt.index, raw_dir: attempt.raw_dir,
          error: final.error, action_count: final.action_count, screenshot_retries: final.screenshot_retries, duration_ms: final.duration_ms, usage: final.usage };
        try {
          const written = await writeV2({ task, rawDir: attempt.raw_dir, outDir: path.join(runDir, 'trajectories') });
          row.validation = await validateTrajectoryDir(written.dir); row.exported = row.validation.ok; row.warnings = written.warnings;
        } catch (err) { row.export_error = err.message; }
        manifest.outcomes.push(row);
        await appendFile(path.join(runDir, 'outcomes.jsonl'), JSON.stringify(row) + '\n');
        await checkpoint(); console.log(JSON.stringify(row));
        if (browser) await closeTaskTabs(browser.cdp);
      }
    }
    refreshRunState(manifest);
    manifest.state = signal?.aborted ? 'paused' : manifest.collection_complete ? 'collection_complete' : manifest.state;
    await checkpoint();
    if (o.judge && manifest.collection_complete && !signal?.aborted) {
      manifest.state = 'judging'; await checkpoint();
      const judged = await (dependencies.runJudgeJobs ?? runJudgeJobs)({ runDir, manifest, passes: manifest.judge_passes,
        syntheticModels: dry && !o['real-agent'], wait: o['wait-for-resources'], waitMs: Number(o['wait-seconds']) * 1000, signal });
      manifest.state = judged.complete ? 'complete' : 'waiting_for_judges';
    }
    manifest.ended_at = new Date().toISOString(); await checkpoint();
    return { runDir, manifest };
  } catch (err) {
    if (manifest) { manifest.state = 'paused_error'; manifest.last_error = err.message; await checkpoint(); }
    throw err;
  } finally {
    try { if (browser) await browser.close(); }
    finally { try { if (hub) await hub.close(); } finally { await releaseLock(); } }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  process.once('SIGTERM', () => controller.abort()); process.once('SIGINT', () => controller.abort());
  try {
    const cli = options(process.argv.slice(2));
    const result = await runBench(cli, { signal: controller.signal });
    console.log(JSON.stringify({ runDir: result.runDir, state: result.manifest.state, expected: result.manifest.expected, attempted: result.manifest.attempted ?? 0, exported: result.manifest.exported ?? 0 }));
    if (!result.manifest.collection_complete || (cli.judge && result.manifest.state !== 'complete')) process.exitCode = 1;
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
