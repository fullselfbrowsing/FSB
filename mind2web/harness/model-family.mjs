import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BENCH_ROOT, REPO_ROOT } from './proc.mjs';

// One model family drives the actor, image contract, judges and reports, so a
// frozen run cannot silently mix families. The Python judge reads the same file.
export const FAMILY_CONFIG_PATH = path.join(BENCH_ROOT, 'config/model-family.json');
const config = JSON.parse(readFileSync(FAMILY_CONFIG_PATH, 'utf8'));

export const FAMILY = config.family;
export const MODEL = config.model;
export const EFFORT = config.effort;
export const CLIENT_LABEL = config.client_label;
export const JUDGE_ENGINE = config.judge_engine;
export const JUDGE_ENGINE_CLASS = config.judge_engine_class;
// The CLI auto-updates in place, so the run uses a byte-pinned copy.
export const CLAUDE_CLI = path.join(REPO_ROOT, config.cli.path);
export const CLAUDE_CLI_PIN = Object.freeze({ version: config.cli.version, sha256: config.cli.sha256 });
// Admission pauses before a window is exhausted so in-flight tasks can finish.
export const QUOTA_HEADROOM = Object.freeze({ ...config.quota_headroom });
export const DEFAULT_CIRCUIT = path.join(REPO_ROOT, config.circuit);
