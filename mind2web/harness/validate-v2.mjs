import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectImage } from './png.mjs';

const schema = JSON.parse(await readFile(new URL('../schema/schema_v2.json', import.meta.url), 'utf8'));
function check(value, s, where, errors) {
  if (s.$ref) s = schema.$defs[s.$ref.split('/').at(-1)];
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value;
  if (s.type && ![s.type].flat().includes(type)) { errors.push(`${where}: expected ${s.type}, got ${type}`); return; }
  if (s.const !== undefined && value !== s.const) errors.push(`${where}: expected ${s.const}`);
  if (s.enum && !s.enum.includes(value)) errors.push(`${where}: invalid enum value`);
  if (typeof value === 'string') {
    if (s.minLength && !value.length) errors.push(`${where}: empty string`);
    if (s.pattern && !new RegExp(s.pattern).test(value)) errors.push(`${where}: invalid format`);
    if (s.format === 'uri') { try { new URL(value); } catch { errors.push(`${where}: invalid URI`); } }
  }
  if (typeof value === 'number' && s.minimum !== undefined && value < s.minimum) errors.push(`${where}: below ${s.minimum}`);
  if (Array.isArray(value)) {
    if (value.length < (s.minItems ?? 0)) errors.push(`${where}: too few items`);
    value.forEach((v, i) => check(v, s.items, `${where}[${i}]`, errors));
  } else if (value && typeof value === 'object') {
    for (const key of s.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${where}.${key}: missing`);
    for (const [key, v] of Object.entries(value)) {
      if (s.properties?.[key]) check(v, s.properties[key], `${where}.${key}`, errors);
      else if (s.additionalProperties === false) errors.push(`${where}.${key}: unexpected field`);
    }
  }
}
export async function validateTrajectoryDir(dir) {
  const errors = [];
  try {
    const result = JSON.parse(await readFile(path.join(dir, 'result.json'), 'utf8'));
    check(result, schema, 'result', errors);
    if (result.task_id !== path.basename(path.resolve(dir))) errors.push('task_id does not match directory name');
    const steps = result.action_history;
    if (Array.isArray(steps)) {
      const names = [];
      const traj = await realpath(path.join(dir, 'trajectory'));
      for (const [i, step] of steps.entries()) {
        if (!step || typeof step !== 'object') continue;
        if (step.step !== i) errors.push(`step ${i}: non-contiguous index`);
        if (typeof step.screenshot !== 'string' || path.basename(step.screenshot) !== step.screenshot) continue;
        names.push(step.screenshot);
        try {
          const file = await realpath(path.join(traj, step.screenshot));
          if (path.dirname(file) !== traj) throw new Error('screenshot escapes trajectory directory');
          const image = inspectImage(await readFile(file), path.extname(file).slice(1));
          if (!image.ok) throw new Error(image.error);
        } catch (err) { errors.push(`step ${i}: ${err.message}`); }
        const suffix = typeof step.action === 'string' ? step.action.match(/\| (SUCCESS|FAILED)$/)?.[1] ?? null : null;
        if (step.action_status !== undefined && step.action_status !== suffix) errors.push(`step ${i}: status does not match action suffix`);
        if (i < steps.length - 1 && step.action?.startsWith('TASK_COMPLETE')) errors.push(`step ${i}: early TASK_COMPLETE`);
      }
      if (new Set(names).size !== names.length) errors.push('screenshots must have unique filenames');
      if (names.join('\n') !== [...names].sort().join('\n')) errors.push('screenshots do not sort into step order');
      const last = steps.at(-1);
      if (last?.action !== `TASK_COMPLETE -> ANSWER:${result.agent_final_answer ? ' ' + result.agent_final_answer : ''}`) errors.push('terminal answer does not equal agent_final_answer');
    }
  } catch (err) { errors.push(err.message); }
  return { ok: errors.length === 0, errors };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) { console.error('Usage: node validate-v2.mjs <trajectoriesRoot>'); process.exit(2); }
  let dirs;
  try { await readFile(path.join(root, 'result.json')); dirs = [root]; }
  catch { dirs = (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => path.join(root, e.name)); }
  if (!dirs.length) { console.error('No trajectories found'); process.exitCode = 1; }
  for (const dir of dirs) { const result = await validateTrajectoryDir(dir); console.log(JSON.stringify({ dir, ...result })); if (!result.ok) process.exitCode = 1; }
}
