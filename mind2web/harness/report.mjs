import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

function csvCell(value) { return '"' + String(value ?? '').replaceAll('"', '""') + '"'; }
export async function writeReport(runDir, manifest) {
  const outcomes = new Map(manifest.outcomes.map(row => [row.task_id, row]));
  const rows = manifest.task_ids.map(task_id => ({ task_id, outcome: 'pending', exported: false, ...outcomes.get(task_id),
    prior_infrastructure_attempts: manifest.provenance?.attempts?.filter(attempt => attempt.task_id === task_id).length ?? 0 }));
  const judges = [];
  const predictions = new Map();
  const judgeRoot = path.join(runDir, 'judge');
  try {
    for (const entry of await readdir(judgeRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const summary = JSON.parse(await readFile(path.join(judgeRoot, entry.name, 'summary.json'), 'utf8'));
        judges.push({ job: entry.name, ...summary });
        for (const line of (await readFile(path.join(judgeRoot, entry.name, 'results.jsonl'), 'utf8')).split('\n').filter(Boolean)) {
          const row = JSON.parse(line);
          if (!predictions.has(row.task_id)) predictions.set(row.task_id, {});
          predictions.get(row.task_id)[entry.name] = row.error ? 'error' : row.predicted_label;
        }
      } catch {}
    }
  } catch {}
  const disagreements = [...predictions].filter(([, values]) => new Set(Object.values(values)).size > 1).map(([task_id, verdicts]) => ({ task_id, verdicts }));
  await writeFile(path.join(runDir, 'judge-disagreements.json'), JSON.stringify(disagreements, null, 2) + '\n');
  for (const row of rows) row.judge_verdicts = predictions.get(row.task_id) ?? {};
  await writeFile(path.join(runDir, 'per-task.json'), JSON.stringify(rows, null, 2) + '\n');
  const fields = ['task_id', 'outcome', 'exported', 'selected_attempt', 'prior_infrastructure_attempts', 'action_count', 'screenshot_retries', 'duration_ms', 'error'];
  const judgeColumns = judges.map(judge => judge.job).sort();
  await writeFile(path.join(runDir, 'per-task.csv'), [...fields, ...judgeColumns].map(csvCell).join(',') + '\n' + rows.map(row => [
    ...fields.map(key => csvCell(row[key])), ...judgeColumns.map(key => csvCell(row.judge_verdicts[key])),
  ].join(',')).join('\n') + '\n');
  const groups = new Map();
  for (const judge of judges) {
    const key = `${judge.model}/${judge.variant}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(judge);
  }
  const aggregates = [...groups].map(([group, passes]) => {
    const complete = manifest.collection_complete && passes.length === (manifest.scripted ? 1 : manifest.judge_passes) && passes.every(judge => judge.expected === manifest.expected && judge.pending_judgments === 0);
    const rates = passes.map(judge => judge.success_rate);
    return { group, passes: passes.length, complete, mean_success_rate: complete ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
      min_success_rate: complete ? Math.min(...rates) : null, max_success_rate: complete ? Math.max(...rates) : null };
  });
  const count = rows.reduce((counts, row) => { counts[row.outcome] = (counts[row.outcome] ?? 0) + 1; return counts; }, {});
  // Byte accounting is limited to immutable attempt artifacts, not live browser caches.
  async function bytes(dir) {
    let total = 0;
    try { for (const entry of await readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) total += await bytes(file); else if (entry.isFile()) total += (await stat(file)).size; } } catch {}
    return total;
  }
  const artifacts = await bytes(path.join(runDir, 'raw')) + await bytes(path.join(runDir, 'trajectories'));
  const usageRecords = manifest.attempts?.length ? manifest.attempts.map(attempt => attempt.final ?? {}) : manifest.outcomes;
  const summary = { run_id: path.basename(runDir), driver: manifest.driver, model: manifest.model, effort: manifest.effort,
    state: manifest.state, synthetic: manifest.synthetic, expected: manifest.expected ?? manifest.task_ids.length, terminal: manifest.outcomes.length,
    exported: rows.filter(row => row.exported).length, counts: count, artifact_bytes: artifacts,
    duration_ms: usageRecords.reduce((n, row) => n + (row.duration_ms ?? 0), 0),
    input_tokens: usageRecords.reduce((n, row) => n + (row.usage?.input_tokens ?? 0), 0),
    output_tokens: usageRecords.reduce((n, row) => n + (row.usage?.output_tokens ?? 0), 0), judges, judge_aggregates: aggregates, disagreements: disagreements.length,
    screenshot_retries: usageRecords.reduce((n, row) => n + (row.screenshot_retries ?? 0), 0),
    provenance: manifest.provenance,
    score_label: `${manifest.model} + FSB; substitute WebJudge models, unverified` };
  await writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const text = [`# ${summary.score_label}`, '', `State: **${summary.state}**. ${summary.terminal}/${summary.expected} tasks have terminal records; ${summary.exported} trajectories exported.`,
    '', manifest.synthetic ? 'Synthetic fixture run; not an Online-Mind2Web benchmark result.' : manifest.browser === 'existing' ? 'Shared browser profile; task contexts are independent, browser cookies and site state are shared.' : 'Dedicated browser profile; task contexts are independent, browser cookies and site state are shared within this run.',
    '', `Dataset revision: ${manifest.source.revision ?? 'local/fixture'}. SHA256: ${manifest.source.sha256 ?? 'n/a'}.`,
    `Limits: ${manifest.max_actions} actions and ${manifest.timeout_seconds} seconds per task. Browser mode: ${manifest.browser}.`,
    ...(manifest.provenance ? ['', '## Run provenance', '', manifest.provenance.note] : []),
    '', '## Outcomes', '', ...Object.entries(count).map(([key, value]) => `- ${key}: ${value}`), '', `Artifact bytes: ${artifacts}. Input tokens: ${summary.input_tokens}. Output tokens: ${summary.output_tokens}.`,
    '', '## Judges', '', '| Job | Successes / expected | Errors | Pending |', '|---|---:|---:|---:|', ...judges.map(j => `| ${j.job} | ${j.successes}/${j.expected} | ${j.errors} | ${j.pending_judgments} |`), '',
    ...aggregates.map(group => `${group.group}: ${group.complete ? `mean ${(100 * group.mean_success_rate).toFixed(2)}%; range ${(100 * group.min_success_rate).toFixed(2)}–${(100 * group.max_success_rate).toFixed(2)}% across ${group.passes} passes.` : 'pending; no aggregate score.'}`), '',
    'All expected IDs remain in judge denominators. Pending judging or incomplete collection is not a completed benchmark score.', '', `Judge disagreements: ${disagreements.length}. See per-task.csv, per-task.json and judge-disagreements.json.`, ''];
  await writeFile(path.join(runDir, 'REPORT.md'), text.join('\n'));
  return summary;
}
