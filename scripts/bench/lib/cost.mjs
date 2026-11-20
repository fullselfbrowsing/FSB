/**
 * Cost per completed task, shared by the campaign report (report.mjs) and the
 * release gate report (gate/lib/gate-report.mjs), so the two never disagree
 * on the same rows.
 *
 * Both figures divide the cost of every counted run by the completed runs and
 * follow the rule in gate/lib/decision.mjs: the figure is unavailable (null)
 * unless every counted run has a cost, because a counted run without one
 * would make the per-completed figure look lower than it is.
 *
 * Pure: no imports, no clock, no filesystem, nothing runs at load.
 */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// A per-completed-task cost divides the summed cost of every counted run by the
// completed ones, so a counted run without a cost would bias it low. As in
// decision.mjs, the figure is unavailable unless every counted run has one.
export function costPerCompleted(counted, completed, pick) {
  const values = counted.map(pick).map(finite);
  return completed > 0 && values.length > 0 && values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + value, 0) / completed
    : null;
}

// The Jev split follows decision.mjs's jevRowCost: a run that made no gateway
// call costs zero, and a counted run that reports neither a provider nor an
// estimate figure makes both figures unavailable.
export function jevCostSplitPerCompleted(counted, completed) {
  const unavailable = { provider: null, estimate: null };
  if (completed === 0 || counted.length === 0) return unavailable;
  let provider = 0;
  let estimate = 0;
  for (const row of counted) {
    const jev = isPlainObject(row.jev) ? row.jev : null;
    if (jev === null) return unavailable;
    if (jev.jevCalls === 0) continue;
    const usd = isPlainObject(jev.usd) ? jev.usd : {};
    const rowProvider = finite(usd.provider);
    const rowEstimate = finite(usd.estimate);
    if (rowProvider === null && rowEstimate === null) return unavailable;
    provider += rowProvider === null ? 0 : rowProvider;
    estimate += rowEstimate === null ? 0 : rowEstimate;
  }
  return { provider: provider / completed, estimate: estimate / completed };
}
