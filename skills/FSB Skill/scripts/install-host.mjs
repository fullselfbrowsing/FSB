#!/usr/bin/env node
// install-host.mjs -- confirmation-based multi-host installer (SKILL-05 / SKILL-06)
// Detects other MCP hosts via `npx -y fsb-mcp-server install --list`,
// prompts y/n per host, runs `npx -y fsb-mcp-server install --<host>` only on explicit yes.
// NEVER passes --all. NEVER auto-writes OpenClaw's MCP config (use print-stdio.mjs).

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import process from 'node:process';

const NPX = 'npx';
const PKG = 'fsb-mcp-server';
const MARKERS = ['detected', 'found', 'available', 'configured'];
const FILLER = new Set([
  'mcp', 'host', 'hosts', 'server', 'client', 'clients',
  'config', 'version', 'the', 'with', 'from', 'into', 'at', 'on'
]);
const HOST_NAME_RE = /^[a-z0-9-]+$/;

function runDetect() {
  return new Promise((resolve) => {
    let listOut = '';
    let launched = true;
    const child = spawn(NPX, ['-y', PKG, 'install', '--list'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    child.on('error', (err) => {
      launched = false;
      if (err && err.code === 'ENOENT') {
        process.stdout.write(
          '[FAIL] cannot launch `npx -y fsb-mcp-server install --list` -- is Node 18+ on PATH?\n'
        );
        process.stdout.write(
          'next-step: Install Node 18+ (https://nodejs.org/en/download) and reopen the session.\n'
        );
        process.exit(2);
      }
      process.stdout.write('[FAIL] detect step error: ' + (err && err.message ? err.message : String(err)) + '\n');
      process.exit(2);
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      listOut += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });

    child.on('close', (code) => {
      if (!launched) return;
      resolve({ listOut, code: code == null ? 0 : code });
    });
  });
}

function parseHosts(listOut) {
  const seen = [];
  const lines = listOut.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.toLowerCase();
    let hasMarker = false;
    for (const marker of MARKERS) {
      if (line.indexOf(marker) !== -1) {
        hasMarker = true;
        break;
      }
    }
    if (!hasMarker) continue;

    const tokenRe = /(?:^|\s|:)([a-z][a-z0-9-]+)(?=\s|$|[,.;:])/g;
    let m;
    while ((m = tokenRe.exec(line)) !== null) {
      const tok = m[1];
      if (FILLER.has(tok)) continue;
      if (MARKERS.indexOf(tok) !== -1) continue;
      if (tok === 'openclaw') continue;
      if (seen.indexOf(tok) === -1) seen.push(tok);
    }
  }
  return seen;
}

function ask(rl, prompt) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value == null ? '' : value);
    };
    const onClose = () => finish('');
    rl.once('close', onClose);
    try {
      rl.question(prompt, (answer) => {
        rl.removeListener('close', onClose);
        finish(answer);
      });
    } catch (_err) {
      rl.removeListener('close', onClose);
      finish('');
    }
  });
}

function runInstallHost(host) {
  return new Promise((resolve) => {
    const flag = '--' + host;
    let launched = true;
    const child = spawn(NPX, ['-y', PKG, 'install', flag], {
      stdio: 'inherit',
      shell: false
    });

    child.on('error', (err) => {
      launched = false;
      process.stdout.write(
        '[FAIL] could not launch installer for ' + host + ': ' + (err && err.message ? err.message : String(err)) + '\n'
      );
      resolve({ ok: false, code: -1 });
    });

    child.on('close', (code) => {
      if (!launched) return;
      const exitCode = code == null ? 0 : code;
      resolve({ ok: exitCode === 0, code: exitCode });
    });
  });
}

async function main() {
  const { listOut } = await runDetect();
  const hosts = parseHosts(listOut);

  if (hosts.length === 0) {
    process.stdout.write(
      '[WARN] no other MCP hosts detected. Re-run after installing one (Claude Desktop, Cursor, VS Code, etc.).\n'
    );
    process.exit(0);
  }

  const installed = [];
  const skipped = [];
  const failed = [];

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let stdinClosed = false;
  rl.on('close', () => { stdinClosed = true; });

  for (const host of hosts) {
    if (!HOST_NAME_RE.test(host)) {
      process.stdout.write('[WARN] skipping host with unexpected characters: ' + JSON.stringify(host) + '\n');
      skipped.push(host);
      continue;
    }
    if (host === 'openclaw') {
      process.stdout.write('[WARN] OpenClaw config is print-only -- run print-stdio.mjs instead\n');
      skipped.push(host);
      continue;
    }

    process.stdout.write('Detected host: ' + host + '\n');
    let answer = '';
    if (!stdinClosed) {
      answer = await ask(rl, 'Install fsb-mcp-server into ' + host + '? [y/N]: ');
    } else {
      process.stdout.write('Install fsb-mcp-server into ' + host + '? [y/N]: (stdin closed -- treating as no)\n');
    }
    const trimmed = (answer || '').trim();
    const yes = trimmed === 'y' || trimmed === 'Y';

    if (!yes) {
      skipped.push(host);
      continue;
    }

    const result = await runInstallHost(host);
    if (result.ok) {
      installed.push(host);
    } else {
      failed.push(host + '(exit=' + result.code + ')');
    }
  }

  rl.close();

  process.stdout.write('--- FSB skill install summary ---\n');
  process.stdout.write('[OK] installed: ' + (installed.length ? installed.join(', ') : 'none') + '\n');
  process.stdout.write('[WARN] skipped:  ' + (skipped.length ? skipped.join(', ') : 'none') + '\n');
  if (failed.length) {
    process.stdout.write('[FAIL] errored:   ' + failed.join(', ') + '\n');
  }

  process.exit(0);
}

main().catch((err) => {
  process.stdout.write('[FAIL] unexpected error: ' + (err && err.message ? err.message : String(err)) + '\n');
  process.exit(2);
});
