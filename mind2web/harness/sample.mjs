import { createHash } from 'node:crypto';

export function selectTasks(tasks, { count = tasks.length, seed = 'om2w-v1', ids } = {}) {
  if (ids) {
    const requested = new Set(ids);
    const selected = tasks.filter(t => requested.has(t.task_id));
    if (selected.length !== requested.size) throw new Error('Some requested task IDs are absent from the pinned dataset');
    return selected;
  }
  if (!Number.isInteger(count) || count < 1 || count > tasks.length) throw new Error('Invalid sample count');
  const rank = t => createHash('sha256').update(`${seed}:${t.task_id}`).digest('hex');
  const groups = new Map();
  for (const t of tasks) { if (!groups.has(t.level)) groups.set(t.level, []); groups.get(t.level).push(t); }
  const quotas = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([level, rows]) => {
    const exact = count * rows.length / tasks.length;
    return { level, rows: rows.toSorted((a, b) => rank(a).localeCompare(rank(b))), n: Math.floor(exact), fraction: exact % 1 };
  });
  let remaining = count - quotas.reduce((n, q) => n + q.n, 0);
  for (const q of quotas.toSorted((a, b) => b.fraction - a.fraction)) if (remaining-- > 0) q.n++;
  return quotas.flatMap(q => q.rows.slice(0, q.n));
}
