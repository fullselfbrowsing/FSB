import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const QUALITY_SCRIPT = join(SCRIPT_DIR, 'verify-translation-quality.mjs');
const SYNC_SCRIPT = join(SCRIPT_DIR, 'sync-xliff-targets.mjs');

function canonical(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function hashSource(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function unit({ id, source, target, state = 'translated', reordered = false }) {
  const attributes = reordered ? ` datatype="html" id="${id}"` : ` id="${id}" datatype="html"`;
  const targetXml = target === undefined ? '' : `\n        <target state="${state}">${target}</target>`;
  return `      <trans-unit${attributes}>\n        <source>${source}</source>${targetXml}\n      </trans-unit>`;
}

function xliff(units, targetLanguage) {
  const targetAttribute = targetLanguage ? ` target-language="${targetLanguage}"` : '';
  return `<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="1.2">
  <file source-language="en"${targetAttribute} datatype="plaintext" original="ng2.template">
    <body>
${units.join('\n')}
    </body>
  </file>
</xliff>
`;
}

function fixture({ sourceUnits, targets, allowlist = { allLocales: [], byLocale: {} } }) {
  const root = mkdtempSync(join(tmpdir(), 'fsb-i18n-tools-'));
  const localeDir = join(root, 'src', 'locale');
  const registryDir = join(root, 'src', 'app', 'core', 'i18n');
  mkdirSync(localeDir, { recursive: true });
  mkdirSync(registryDir, { recursive: true });
  const locales = ['en', ...Object.keys(targets)];
  writeFileSync(
    join(registryDir, 'locale-constants.ts'),
    `export const SOURCE_LOCALE = 'en';\nexport const LOCALES = ${JSON.stringify(locales)};\n`,
  );
  writeFileSync(join(localeDir, 'messages.xlf'), xliff(sourceUnits));
  for (const [locale, units] of Object.entries(targets)) {
    writeFileSync(join(localeDir, `messages.${locale}.xlf`), xliff(units, locale));
  }
  writeFileSync(join(localeDir, 'same-source-allowlist.json'), `${JSON.stringify(allowlist, null, 2)}\n`);
  return root;
}

function run(script, cwd, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

function withFixture(options, callback) {
  const root = fixture(options);
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('quality gate accepts translated text and attribute reordering', () => {
  withFixture({
    sourceUnits: [unit({ id: 'greeting', source: 'Hello world', reordered: true })],
    targets: { es: [unit({ id: 'greeting', source: 'Hello world', target: 'Hola mundo', reordered: true })] },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 0, result.output);
  });
});

test('quality gate rejects punctuation and zero-width copied English', () => {
  withFixture({
    sourceUnits: [unit({ id: 'greeting', source: 'Hello world.' })],
    targets: { es: [unit({ id: 'greeting', source: 'Hello world.', target: 'Hello&#8203; world!' })] },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /effectively copies English source/);
  });
});

test('quality gate rejects placeholder-only translated targets', () => {
  const placeholder = '<x id="INTERPOLATION" equiv-text="{{ value }}"/>';
  withFixture({
    sourceUnits: [unit({ id: 'greeting', source: `Hello ${placeholder}` })],
    targets: { es: [unit({ id: 'greeting', source: `Hello ${placeholder}`, target: placeholder })] },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /target has no visible letters or numbers/);
  });
});

test('quality gate rejects machine-translator language annotations', () => {
  withFixture({
    sourceUnits: [unit({ id: 'privacy', source: 'Your browsing data stays on your device.' })],
    targets: {
      'zh-CN': [unit({
        id: 'privacy',
        source: 'Your browsing data stays on your device.',
        target: '您的浏览数据（中文(中国大陆)）保留在您的设备上。',
      })],
    },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /target contains translator artifact/);
  });
});

test('quality gate rejects target-only machine-translator letter markers', () => {
  withFixture({
    sourceUnits: [unit({ id: 'privacy', source: 'Erase the telemetry record.' })],
    targets: {
      'zh-CN': [unit({
        id: 'privacy',
        source: 'Erase the telemetry record.',
        target: '删除遥测记录。(Q)',
      })],
    },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /target contains translator artifact/);
  });
});

test('quality gate rejects unbalanced target parentheses', () => {
  withFixture({
    sourceUnits: [unit({ id: 'tools', source: 'Use the task helper (run_task).' })],
    targets: {
      es: [unit({
        id: 'tools',
        source: 'Use the task helper (run_task).',
        target: 'Usa el asistente de tareas (run_task)).',
      })],
    },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /target contains unbalanced parentheses/);
  });
});

test('quality gate rejects corrupted invariant product names outside protected markup', () => {
  withFixture({
    sourceUnits: [unit({ id: 'product', source: 'Prometheus is under active development.' })],
    targets: {
      'zh-CN': [unit({
        id: 'product',
        source: 'Prometheus is under active development.',
        target: '普罗米修斯正在积极开发中。',
      })],
    },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /target must preserve technical literal "Prometheus"/);
  });
});

test('quality gate rejects translated text inside a translate=no placeholder pair', () => {
  const start = '<x id="START_TAG_SPAN" ctype="x-span" equiv-text="&lt;span [attr.translate]=&quot;&apos;no&apos;&quot;&gt;"/>';
  const close = '<x id="CLOSE_TAG_SPAN" ctype="x-span" equiv-text="&lt;/span&gt;"/>';
  const source = `Use ${start}OpenAI${close} for this request`;
  const target = `Usa ${start}AbrirAI${close} para esta solicitud`;
  withFixture({
    sourceUnits: [unit({ id: 'protected-brand', source })],
    targets: { es: [unit({ id: 'protected-brand', source, target })] },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /protected translate=no literal differs from source/);
  });
});

test('quality gate checks protected literals through nested inline tags', () => {
  const outerStart = '<x id="START_TAG_SPAN_2" ctype="x-span_2" equiv-text="&lt;span [attr.translate]=&quot;&apos;no&apos;&quot;&gt;"/>';
  const innerStart = '<x id="START_TAG_SPAN" ctype="x-span" equiv-text="&lt;span class=&quot;brand&quot;&gt;"/>';
  const close = '<x id="CLOSE_TAG_SPAN" ctype="x-span" equiv-text="&lt;/span&gt;"/>';
  const source = `${outerStart}${innerStart}Pro${close}metheus${close}`;
  const target = `${outerStart}${innerStart}Pro${close}米修斯${close}`;
  withFixture({
    sourceUnits: [unit({ id: 'nested-brand', source })],
    targets: { 'zh-CN': [unit({ id: 'nested-brand', source, target })] },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /protected translate=no literal differs from source/);
  });
});

test('quality gate rejects prose hidden inside a non-code translate=no wrapper', () => {
  const start = '<x id="START_TAG_SPAN" ctype="x-span" equiv-text="&lt;span [attr.translate]=&quot;&apos;no&apos;&quot;&gt;"/>';
  const close = '<x id="CLOSE_TAG_SPAN" ctype="x-span" equiv-text="&lt;/span&gt;"/>';
  const protectedSentence = `${start}A text mutation is one small JSON op${close}`;
  const source = `Latency: ${protectedSentence}`;
  const target = `Latencia: ${protectedSentence}`;
  withFixture({
    sourceUnits: [unit({ id: 'overbroad-protection', source })],
    targets: { es: [unit({ id: 'overbroad-protection', source, target })] },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /translate=no protects likely translatable prose/);
  });
});

test('quality gate permits long command text protected by a code element', () => {
  const start = '<x id="START_TAG_CODE" ctype="x-code" equiv-text="&lt;code translate=&quot;no&quot;&gt;"/>';
  const close = '<x id="CLOSE_TAG_CODE" ctype="x-code" equiv-text="&lt;/code&gt;"/>';
  const command = `${start}npx fsb-mcp-server install --claude-code --force${close}`;
  const source = `Run ${command} now`;
  const target = `Ejecuta ${command} ahora`;
  withFixture({
    sourceUnits: [unit({ id: 'protected-command', source })],
    targets: { es: [unit({ id: 'protected-command', source, target })] },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 0, result.output);
  });
});

test('quality gate rejects a retained common-English prose n-gram', () => {
  const source = 'This translated page should show that copied English prose never remains inside the final target.';
  const target = 'Texto traducido. This translated page should show that. Más texto.';
  withFixture({
    sourceUnits: [unit({ id: 'paragraph', source })],
    targets: { es: [unit({ id: 'paragraph', source, target })] },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /retains English phrase/);
  });
});

test('allowlist entries are source-hash-bound and require a reason', () => {
  const source = 'FSB';
  const validEntry = { id: 'brand', sourceSha256: hashSource(source), reason: 'product name' };
  withFixture({
    sourceUnits: [unit({ id: 'brand', source })],
    targets: { es: [unit({ id: 'brand', source, target: source })] },
    allowlist: { allLocales: [validEntry], byLocale: {} },
  }, (root) => {
    const valid = run(QUALITY_SCRIPT, root);
    assert.equal(valid.status, 0, valid.output);
    const allowlistPath = join(root, 'src', 'locale', 'same-source-allowlist.json');
    writeFileSync(allowlistPath, `${JSON.stringify({
      allLocales: [{ ...validEntry, sourceSha256: '0'.repeat(64) }],
      byLocale: {},
    })}\n`);
    const stale = run(QUALITY_SCRIPT, root);
    assert.equal(stale.status, 1, stale.output);
    assert.match(stale.output, /sourceSha256 is stale/);
  });
});

test('normalized-equivalent exceptions are bound to both source and target hashes', () => {
  const source = 'MCP Integration';
  const target = 'MCP-Integration';
  const entry = {
    id: 'compound',
    sourceSha256: hashSource(source),
    targetSha256: hashSource(target),
    reason: 'natural German compound spelling',
  };
  withFixture({
    sourceUnits: [unit({ id: 'compound', source })],
    targets: { de: [unit({ id: 'compound', source, target })] },
    allowlist: {
      allLocales: [],
      byLocale: {},
      equivalentByLocale: { de: [entry] },
    },
  }, (root) => {
    const valid = run(QUALITY_SCRIPT, root);
    assert.equal(valid.status, 0, valid.output);

    const targetPath = join(root, 'src', 'locale', 'messages.de.xlf');
    writeFileSync(targetPath, xliff([
      unit({ id: 'compound', source, target: 'MCP Integration!' }),
    ], 'de'));
    const staleTarget = run(QUALITY_SCRIPT, root);
    assert.equal(staleTarget.status, 1, staleTarget.output);
    assert.match(staleTarget.output, /targetSha256 is stale/);

    const sourcePath = join(root, 'src', 'locale', 'messages.xlf');
    writeFileSync(sourcePath, xliff([unit({ id: 'compound', source: 'MCP integrations' })]));
    const staleSource = run(QUALITY_SCRIPT, root);
    assert.equal(staleSource.status, 1, staleSource.output);
    assert.match(staleSource.output, /sourceSha256 is stale/);
  });
});

test('quality gate rejects an identical non-source target across locales', () => {
  const source = 'Save changes';
  withFixture({
    sourceUnits: [unit({ id: 'save', source })],
    targets: {
      es: [unit({ id: 'save', source, target: 'Guardar' })],
      de: [unit({ id: 'save', source, target: 'Guardar' })],
    },
  }, (root) => {
    const result = run(QUALITY_SCRIPT, root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /every locale has the same target/);
  });
});

test('sync marks source changes for review and never relabels target placeholders', () => {
  const oldPlaceholder = '<x id="OLD_LINK" equiv-text="old"/>';
  const newPlaceholder = '<x id="NEW_LINK" equiv-text="new"/>';
  const root = fixture({
    sourceUnits: [unit({ id: 'link', source: `New text ${newPlaceholder}`, reordered: true })],
    targets: {
      es: [unit({
        id: 'link',
        source: `Old text ${oldPlaceholder}`,
        target: `Texto ${oldPlaceholder}`,
        reordered: true,
      })],
    },
  });
  try {
    const result = run(SYNC_SCRIPT, root, ['es']);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /source-changed 1/);
    assert.match(result.output, /placeholder-review 1/);
    const target = readFileSync(join(root, 'src', 'locale', 'messages.es.xlf'), 'utf8');
    assert.match(target, /<source>New text <x id="NEW_LINK"/);
    assert.match(target, /<target state="needs-translation">Texto <x id="OLD_LINK"/);
    assert.doesNotMatch(target, /<target[^>]*>Texto <x id="NEW_LINK"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
