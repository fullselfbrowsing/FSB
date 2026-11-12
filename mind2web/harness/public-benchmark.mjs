import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runRepairBenchmark } from './repair-benchmark.mjs';
import { capturePublicSources, verifyPublicPins } from './public-provenance.mjs';
import { PublicAttachmentMonitor } from './public-attachment-monitor.mjs';
import { publicLiveGate, verifyPublicLocalGateEvidence } from './public-live-gate.mjs';
import { DEFAULT_CIRCUIT } from './manual-runner.mjs';

/** The orchestration and recorder are external to the unchanged public product. */
export async function runPublicBenchmark({ publicPins, dependencies = {}, ...options }) {
  await verifyPublicPins(publicPins);
  const monitor = new PublicAttachmentMonitor({ command: options.serverCommand, expected: publicPins.attachment });
  try {
    await monitor.beforeDispatch({ timeoutMs: 15_000 });
    return await runRepairBenchmark({ ...options, publicRelease: true, publicPins, dependencies: {
      captureSources: capturePublicSources,
      localGate: gateOptions => publicLiveGate({ ...gateOptions, beforePublicDispatch: () => monitor.beforeDispatch() }),
      verifyLocalEvidence: verifyPublicLocalGateEvidence,
      beforePublicDispatch: () => monitor.beforeDispatch(), ...dependencies,
    } });
  } finally {
    const receipt = await monitor.close();
    const configured = options.outputDir && await readFile(path.join(options.outputDir, 'pipeline.json')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (configured) {
      await writeFile(path.join(options.outputDir, `public-attachment-monitor-${Date.now()}.json`), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    }
  }
}

export async function runPublicCLI(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: {
    'extension-dir': { type: 'string' }, output: { type: 'string' }, 'full-run-id': { type: 'string' },
    'fsb-server-cmd': { type: 'string' }, 'public-pins': { type: 'string' },
    'circuit-state': { type: 'string', default: DEFAULT_CIRCUIT }, resume: { type: 'boolean', default: false },
    'no-wait-resources': { type: 'boolean', default: false },
  } });
  if (!values['public-pins'] || !values['fsb-server-cmd']) throw new Error('Explicit --public-pins and --fsb-server-cmd are required');
  const publicPins = JSON.parse(await readFile(values['public-pins'], 'utf8'));
  const controller = new AbortController(); let drain = false;
  const abort = () => controller.abort(), stopNew = () => { drain = true; };
  process.once('SIGINT', abort); process.once('SIGTERM', abort); process.once('SIGUSR2', stopNew);
  try {
    const result = await runPublicBenchmark({ extensionDir: values['extension-dir'], outputDir: values.output,
      fullRunId: values['full-run-id'], serverCommand: JSON.parse(values['fsb-server-cmd']), publicPins,
      circuitState: values['circuit-state'], resume: values.resume, waitResources: !values['no-wait-resources'],
      signal: controller.signal, shouldStop: () => drain });
    process.exitCode = result.state === 'complete' ? 0 : result.state === 'paused_health' ? 1 : 75;
    return result;
  } finally {
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); process.removeListener('SIGUSR2', stopNew);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPublicCLI().catch(error => { console.error(JSON.stringify({ state: 'paused_health', code: error.code ?? error.name, error: error.message })); process.exitCode = 1; });
}
