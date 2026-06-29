#!/usr/bin/env node
/**
 * Phase 45 / Plan 01 -- T1 port checklist scaffold.
 *
 * Prints a markdown checklist for a descriptor slug using the current readiness
 * report. The default mode is stdout-only; pass --out to write a local checklist.
 *
 * Examples:
 *   node scripts/scaffold-t1-port.mjs --slug gitlab.list_projects
 *   node scripts/scaffold-t1-port.mjs --slug linear.create_issue --type separate-origin-candidate
 */

'use strict';

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

import { reportReadiness } from './report-t1-readiness.mjs';
import {
  PORT_TYPES,
  inferPortType,
  renderT1PortChecklist,
} from './lib/t1-port-contract.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { slug: '', type: '', outPath: '', help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--slug') out.slug = argv[++i] || '';
    else if (arg === '--type') out.type = argv[++i] || '';
    else if (arg === '--out') out.outPath = argv[++i] || '';
    else if (!out.slug && !arg.startsWith('-')) out.slug = arg;
  }
  return out;
}

function usage() {
  return [
    'Usage: node scripts/scaffold-t1-port.mjs --slug <capability.slug> [--type <type>] [--out <path>]',
    '',
    'Types:',
    '  ' + Object.values(PORT_TYPES).join(', '),
    '',
    'Default behavior prints markdown to stdout. Use --out only when you want a saved checklist.',
  ].join('\n');
}

async function loadCatalog() {
  const mod = await import(pathToFileURL(resolve(ROOT, 'extension', 'catalog', 'recipe-index.generated.js')).href);
  return mod.default || mod;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.slug) {
    console.error(usage());
    process.exit(1);
  }
  if (args.type && !Object.values(PORT_TYPES).includes(args.type)) {
    console.error('Unknown --type: ' + args.type);
    console.error('Allowed: ' + Object.values(PORT_TYPES).join(', '));
    process.exit(1);
  }

  const catalog = await loadCatalog();
  const report = reportReadiness(catalog);
  const row = report.rows.find(function(candidate) { return candidate && candidate.slug === args.slug; }) || {
    slug: args.slug,
    app: args.slug.indexOf('.') === -1 ? args.slug : args.slug.slice(0, args.slug.indexOf('.')),
    service: '',
    sideEffectClass: args.type === PORT_TYPES.SAME_ORIGIN_WRITE ||
      args.type === PORT_TYPES.GUARDED_WRITE ? 'write' : 'read',
    runtimeOrigin: '',
    routeFeasibility: args.type === PORT_TYPES.SEPARATE_ORIGIN_CANDIDATE
      ? 'pattern-d-candidate'
      : 'same-origin-read-candidate',
    proof: args.type === PORT_TYPES.SEPARATE_ORIGIN_CANDIDATE ? 'candidate' : 'handler',
  };

  const portType = args.type || inferPortType(row);
  const markdown = renderT1PortChecklist(row, { portType, slug: args.slug });
  if (args.outPath) {
    writeFileSync(resolve(process.cwd(), args.outPath), markdown + '\n');
  } else {
    process.stdout.write(markdown + '\n');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli().catch(function(err) {
    console.error('scaffold-t1-port: ERROR ' + (err && err.message ? err.message : String(err)));
    process.exit(1);
  });
}
