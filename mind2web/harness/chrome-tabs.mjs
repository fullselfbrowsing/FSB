import { runCommand } from './proc.mjs';

// AppleScript sees the same tab IDs as chrome.tabs. Only the exact IDs given are
// closed, so a benchmark popup the extension refuses to close never outlives its task.
export async function closeChromeTabs(ids, { run = runCommand } = {}) {
  const targets = [...new Set(ids)].filter(id => Number.isSafeInteger(id) && id > 0);
  if (!targets.length) return { ok: true, closed: [], missing: [] };
  const script = `on run argv
  set closed to {}
  tell application "Google Chrome"
    repeat with idText in argv
      set targetId to (idText as integer)
      repeat with w in windows
        set matches to (tabs of w whose id is targetId)
        repeat with t in matches
          close t
          set end of closed to (targetId as text)
        end repeat
      end repeat
    end repeat
  end tell
  set AppleScript's text item delimiters to ","
  return closed as text
end run`;
  const result = await run('/usr/bin/osascript', ['-e', script, ...targets.map(String)], { timeoutMs: 20_000 });
  const closed = result.code === 0 ? result.stdout.trim().split(',').filter(Boolean).map(Number) : [];
  return { ok: result.code === 0, closed, missing: targets.filter(id => !closed.includes(id)),
    ...(result.code === 0 ? {} : { error: (result.stderr || result.stdout).slice(-400) }), method: 'osascript_exact_tab_ids' };
}
