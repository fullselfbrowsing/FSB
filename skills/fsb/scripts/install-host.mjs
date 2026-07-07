#!/usr/bin/env node
// install-host.mjs -- confirmation-based multi-host installer (SKILL-05 / SKILL-06)
// Detects other MCP hosts via `npx -y fsb-mcp-server install --list`,
// prompts y/n per host, runs `npx -y fsb-mcp-server install --<host>` only on explicit yes.
// NEVER passes --all. NEVER auto-writes OpenClaw's MCP config (use print-stdio.mjs).

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import process from 'node:process';
import os from 'node:os';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const NPX = 'npx';
const PKG = 'fsb-mcp-server';
const MARKERS = ['detected', 'found', 'available', 'configured'];
const FILLER = new Set([
  'mcp', 'host', 'hosts', 'server', 'client', 'clients',
  'config', 'version', 'the', 'with', 'from', 'into', 'at', 'on'
]);
const HOST_NAME_RE = /^[a-z0-9-]+$/;

// Hermes Skills Hub branch (additive to the existing CLI-driven host loop).
// Mirrors the OpenClaw skip pattern -- detection is filesystem-based, install
// is fs.writeFileSync-based; we NEVER pass --hermes to the CLI (no such flag).
const HERMES_CONFIG_PATH = path.join(os.homedir(), '.hermes', 'config.yaml');
const HERMES_BLOCK = `mcp_servers:
  fsb:
    command: "npx"
    args: ["-y", "fsb-mcp-server"]
`;
const HERMES_FSB_CHILD = `  fsb:
    command: "npx"
    args: ["-y", "fsb-mcp-server"]
`;

// Detect the indent width used by direct children of `mcp_servers:`.
// Walks lines after the heading; the first line that starts with whitespace +
// an alphanumeric `key:` defines the indent unit. Returns 2 if none found
// before EOF or a column-0 line.
//
// Worked example -- input:
//   mcp_servers:
//       other:        <- 4-space indent
//         command: "x"
// Returns: 4
function detectMcpServersIndent(content) {
  const lines = content.split('\n');
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^mcp_servers:\s*(?:#.*)?$/.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return 2;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // Column-0 non-whitespace = end of mcp_servers block
    if (line.length > 0 && !/^\s/.test(line)) return 2;
    const m = /^(\s+)[A-Za-z0-9_-]+:/.exec(line);
    if (m) return m[1].length;
  }
  return 2;
}

// Returns true only if `fsb:` exists as a DIRECT child of `mcp_servers:`
// (matches the detected indent exactly, not deeper). Scoped to the
// mcp_servers block; ends at first column-0 non-whitespace line or EOF.
function findFsbInMcpServers(content) {
  const lines = content.split('\n');
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^mcp_servers:\s*(?:#.*)?$/.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return false;
  const indent = detectMcpServersIndent(content);
  const directChildRe = new RegExp('^' + ' '.repeat(indent) + 'fsb:\\s*$');
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 0 && !/^\s/.test(line)) return false; // left the block
    if (directChildRe.test(line)) return true;
  }
  return false;
}

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

async function maybeInstallHermes(rl, stdinClosed) {
  if (!existsSync(HERMES_CONFIG_PATH)) {
    process.stdout.write(
      '[WARN] no Hermes config detected at ~/.hermes/config.yaml -- skipping Hermes branch\n'
    );
    return { status: 'skipped' };
  }

  let existing = '';
  try {
    existing = readFileSync(HERMES_CONFIG_PATH, 'utf8');
  } catch (err) {
    process.stdout.write(
      '[FAIL] could not read ~/.hermes/config.yaml: ' + (err && err.message ? err.message : String(err)) + '\n'
    );
    return { status: 'failed' };
  }

  // Already-configured guard: only true when `fsb:` is a DIRECT child of
  // `mcp_servers:` (avoids cross-section false positives like `other_thing.fsb:`).
  if (findFsbInMcpServers(existing)) {
    process.stdout.write('[WARN] Hermes config already has mcp_servers.fsb -- not overwriting\n');
    return { status: 'already_configured' };
  }

  process.stdout.write('Detected Hermes config at ~/.hermes/config.yaml\n');

  let answer = '';
  if (!stdinClosed) {
    answer = await ask(rl, 'Inject fsb mcp_servers block? [y/N]: ');
  } else {
    process.stdout.write('Inject fsb mcp_servers block? [y/N]: (stdin closed -- treating as no)\n');
  }
  const trimmed = (answer || '').trim();
  const yes = trimmed === 'y' || trimmed === 'Y';

  if (!yes) {
    process.stdout.write('Skipped Hermes\n');
    return { status: 'skipped' };
  }

  let newContent;
  if (/^mcp_servers:\s*(?:#.*)?$/m.test(existing)) {
    // File has an `mcp_servers:` heading already (possibly with trailing comment) --
    // inject the fsb child immediately after that heading line so other mcp_servers
    // entries are preserved. Indent is detected from any existing children so we
    // match the user's style rather than forcing 2 spaces.
    const indent = detectMcpServersIndent(existing);
    const indentStr = ' '.repeat(indent);
    const fsbChild =
      indentStr + 'fsb:\n' +
      indentStr + indentStr + 'command: "npx"\n' +
      indentStr + indentStr + 'args: ["-y", "fsb-mcp-server"]\n';
    newContent = existing.replace(/^(mcp_servers:\s*(?:#.*)?)\n/m, '$1\n' + fsbChild);
  } else {
    // No existing mcp_servers heading -- append the full block, ensuring the
    // file ends with a newline before the appended block.
    const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
    newContent = existing + sep + HERMES_BLOCK;
  }

  try {
    writeFileSync(HERMES_CONFIG_PATH, newContent, 'utf8');
  } catch (err) {
    process.stdout.write(
      '[FAIL] could not write ~/.hermes/config.yaml: ' + (err && err.message ? err.message : String(err)) + '\n'
    );
    return { status: 'failed' };
  }

  process.stdout.write('[OK] wrote mcp_servers.fsb into ~/.hermes/config.yaml\n');
  return { status: 'installed' };
}

async function main() {
  const { listOut } = await runDetect();
  const hosts = parseHosts(listOut);

  const installed = [];
  const skipped = [];
  const failed = [];

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let stdinClosed = false;
  rl.on('close', () => { stdinClosed = true; });

  if (hosts.length === 0) {
    process.stdout.write(
      '[WARN] no other MCP hosts detected via the CLI list. Re-run after installing one (Claude Desktop, Cursor, VS Code, etc.).\n'
    );
  }

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

  // Hermes Skills Hub branch: filesystem-based detection (no CLI flag). Runs
  // independently after the CLI-driven host loop so it surfaces in the summary
  // bucket alongside the other hosts.
  const hermesResult = await maybeInstallHermes(rl, stdinClosed);
  if (hermesResult.status === 'installed') {
    installed.push('hermes');
  } else if (hermesResult.status === 'failed') {
    failed.push('hermes(write-failed)');
  } else {
    // 'skipped' and 'already_configured' both fall into the skipped bucket.
    skipped.push('hermes');
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
