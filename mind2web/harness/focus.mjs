import { runCommand } from './proc.mjs';

export async function checkFocus(run = runCommand) {
  if (process.platform !== 'darwin') return { ok: false, error: 'The live rig currently supports macOS only' };
  const name = await run('osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.frontmostApplication.localizedName.js']);
  const frontmost = name.stdout.trim();
  return { ok: name.code === 0 && /Chrome for Testing/.test(frontmost), frontmost };
}
