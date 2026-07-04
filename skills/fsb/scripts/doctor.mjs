#!/usr/bin/env node
// doctor.mjs -- FSB skill diagnostic dispatcher (SKILL-03 / SKILL-06)
// Wraps `npx -y fsb-mcp-server doctor`, parses the failing layer,
// and prints a focused [OK]/[FAIL]/[WARN] branch with a one-line next step.
// Cross-platform: Node ESM only; no shell-specific assumptions.
//
// Exit code contract:
//   0 -- all six layers green ([OK])
//   1 -- a known layer failed ([FAIL])
//   2 -- could not launch the doctor at all (npx / Node missing)
//   3 -- doctor ran but its output was unparseable ([WARN])

import { spawn } from 'node:child_process';
import process from 'node:process';

// Most-fundamental first; first failing layer wins.
const LAYERS = ['package', 'bridge', 'extension', 'active-tab', 'content-script', 'config'];

const NEXT_STEPS = {
  package:        'Run `npx -y fsb-mcp-server --version` to confirm npm can reach the package.',
  bridge:         'Start the FSB extension and run `npx -y fsb-mcp-server status --watch` to confirm ws://localhost:7225 is reachable.',
  extension:      'Install the FSB Chrome extension from https://chromewebstore.google.com/detail/badgafnfchcihdfnjneklogedcdkmjfk -- then reopen this session.',
  'active-tab':   'Open a normal http(s) tab (not chrome://, edge://, or the Web Store) and run `npx -y fsb-mcp-server status --watch` to re-attach.',
  'content-script': 'Reload the active tab. The FSB content script attaches on page load; reloads after extension install are required.',
  config:         'Re-run `npx -y fsb-mcp-server install --<host>` for your MCP host (replace <host> with claude-desktop, cursor, etc.).',
  ok:             'All layers green. Run a small read_page or list_tabs call to confirm end-to-end.',
};

const FAILURE_MARKERS = [
  'fail',
  'error',
  'missing',
  'timeout',
  'not reachable',
  'not found',
  'not detected',
  'unreachable',
];

const FENCE = '--- FSB skill doctor summary ---';

function emitSummary(headerLines) {
  process.stdout.write('\n');
  process.stdout.write(FENCE + '\n');
  for (const line of headerLines) {
    process.stdout.write(line + '\n');
  }
}

function parseFailingLayer(buffer) {
  const lower = buffer.toLowerCase();
  const lines = lower.split(/\r?\n/);

  // Pass 0: prefer the doctor's own explicit `Layer: <name>` anchor when present.
  // This wins over substring heuristics so verbose bridge-subsystem log lines
  // (e.g., "[FSB Bridge ...] << Response: ... error=...") cannot fake a match.
  for (const line of lines) {
    const m = line.match(/(^|\s)layer:\s*([a-z\-]+)/);
    if (!m) continue;
    const value = m[2].trim();
    if (value === 'ok') return 'ok';
    if (LAYERS.includes(value)) return value;
  }

  // Pass 1: scan line-by-line for first layer keyword paired with a failure marker
  // on the same line. Skip noisy bridge-subsystem log lines that begin with
  // a "[fsb bridge" prefix -- those are runtime logs, not the layered diagnostic.
  for (const layer of LAYERS) {
    for (const line of lines) {
      if (line.startsWith('[fsb bridge')) continue;
      if (!line.includes(layer)) continue;
      for (const marker of FAILURE_MARKERS) {
        if (line.includes(marker)) {
          return layer;
        }
      }
    }
  }

  // Pass 2: detect "all green" / per-layer [OK] success state.
  if (lower.includes('all green')) {
    return 'ok';
  }

  // If every layer keyword appears with [ok] nearby on its line, treat as ok.
  let okHits = 0;
  for (const layer of LAYERS) {
    for (const line of lines) {
      if (line.includes(layer) && line.includes('[ok]')) {
        okHits += 1;
        break;
      }
    }
  }
  if (okHits === LAYERS.length) {
    return 'ok';
  }

  // Ambiguous -- caller emits [WARN].
  return null;
}

function main() {
  let combined = '';
  let launched = false;

  const child = spawn('npx', ['-y', 'fsb-mcp-server', 'doctor'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  child.on('error', (err) => {
    // ENOENT or similar -- could not launch the doctor at all.
    if (!launched) {
      process.stderr.write(`spawn error: ${err && err.message ? err.message : String(err)}\n`);
      emitSummary([
        '[FAIL] cannot launch `npx -y fsb-mcp-server doctor` -- is Node 18+ installed and on PATH?',
        'next-step: Install Node 18+ (https://nodejs.org/en/download) and reopen the session.',
      ]);
      process.exit(2);
    }
  });

  child.stdout.on('data', (chunk) => {
    launched = true;
    const text = chunk.toString('utf8');
    combined += text;
    process.stdout.write(text);
  });

  child.stderr.on('data', (chunk) => {
    launched = true;
    const text = chunk.toString('utf8');
    combined += text;
    process.stderr.write(text);
  });

  child.on('close', (code) => {
    if (!launched) {
      // 'error' handler already emitted; just bail.
      return;
    }

    const failingLayer = parseFailingLayer(combined);

    if (failingLayer === 'ok') {
      emitSummary([
        '[OK] all six layers green',
        'next-step: ' + NEXT_STEPS.ok,
      ]);
      process.exit(0);
    } else if (failingLayer && LAYERS.includes(failingLayer)) {
      emitSummary([
        '[FAIL] failing layer: ' + failingLayer,
        'next-step: ' + NEXT_STEPS[failingLayer],
      ]);
      process.exit(1);
    } else {
      // Unparseable output. If the child exited non-zero we still surface [WARN]
      // so OpenClaw sees a structured branch, but the exit code marks ambiguity.
      void code;
      emitSummary([
        '[WARN] doctor output did not match a known layer pattern; raw output above',
        'next-step: re-run `npx -y fsb-mcp-server doctor` and report this output if it persists.',
      ]);
      process.exit(3);
    }
  });
}

main();
