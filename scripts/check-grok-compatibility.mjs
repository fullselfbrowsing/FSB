#!/usr/bin/env node

import { constants } from 'node:fs';
import { access, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGrokBuildDetector } from '../mcp/build/agent-providers/grok-detect.js';
import {
  createGrokBuildPrivateRuntime,
  GROK_BUILD_PROFILE_VERSION,
} from '../mcp/build/agent-providers/grok-runtime.js';

// A fresh private home makes this check independent of account credentials and
// installed customizations. Detection never creates a session or sends a prompt.
export async function checkGrokCompatibility(binaryPath) {
  if (binaryPath !== undefined && (!isAbsolute(binaryPath) || binaryPath.includes('\0'))) {
    throw new TypeError('Expected an absolute Grok executable path');
  }
  const root = await mkdtemp(join(tmpdir(), 'fsb-grok-compatibility-'));
  try {
    const runtime = createGrokBuildPrivateRuntime({ rootPath: root });
    const detection = await createGrokBuildDetector({
      runtime,
      ...(binaryPath ? {
        resolveBinary: async () => {
          try {
            await access(binaryPath, constants.X_OK);
            const realPath = await realpath(binaryPath);
            if (!(await stat(realPath)).isFile()) return null;
            return { sourcePath: binaryPath, realPath };
          } catch {
            return null;
          }
        },
      } : {}),
    }).detect();
    const compatible = detection.installed
      && detection.profileVersion === GROK_BUILD_PROFILE_VERSION;
    return {
      provider: 'grok-build',
      cliVersion: detection.version,
      contract: GROK_BUILD_PROFILE_VERSION,
      compatible,
      authState: detection.authState,
      code: compatible ? 'capability_verified' : detection.diagnostic?.code ?? 'adapter_unavailable',
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--binary')) {
    console.error('Usage: node scripts/check-grok-compatibility.mjs [--binary /absolute/path/to/grok]');
    process.exitCode = 2;
  } else {
    try {
      const result = await checkGrokCompatibility(args[1]);
      console.log(JSON.stringify(result));
      process.exitCode = result.compatible ? 0 : 1;
    } catch {
      console.log(JSON.stringify({ compatible: false, code: 'grok_compatibility_probe_failed' }));
      process.exitCode = 1;
    }
  }
}
