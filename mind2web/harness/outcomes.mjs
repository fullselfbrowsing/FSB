export function deriveOutcome(result, execution) {
  if (execution.timedOut) return 'timeout';
  if (!result) return execution.code === 127 ? 'never_started' : 'error';
  if (result.subtype === 'error_max_turns') return 'max_turns';
  if (result.is_error || result.subtype !== 'success' || execution.code !== 0) return 'error';
  return 'complete';
}
