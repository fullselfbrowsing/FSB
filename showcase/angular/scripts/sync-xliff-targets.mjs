#!/usr/bin/env node

import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const SOURCE_PATH = 'src/locale/messages.xlf';
const DEFAULT_LOCALES = ['es', 'de', 'ja', 'zh-CN', 'zh-TW'];
const locales = process.argv.slice(2);
const selectedLocales = locales.length ? locales : DEFAULT_LOCALES;

function unitsById(xliff) {
  const units = new Map();
  const unitPattern = /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g;
  let match;
  while ((match = unitPattern.exec(xliff)) !== null) {
    const id = match[1].match(/\bid="([^"]+)"/)?.[1];
    if (!id) throw new Error('Encountered a <trans-unit> without an id attribute');
    if (units.has(id)) throw new Error(`Duplicate trans-unit id ${id}`);
    units.set(id, { attributes: match[1], body: match[2] });
  }
  if (units.size === 0) throw new Error('XLIFF contains no trans-units');
  return units;
}

function sourceBody(unitBody, id) {
  const match = unitBody.match(/<source>([\s\S]*?)<\/source>/);
  if (!match) throw new Error(`Source unit ${id} has no <source>`);
  return match[1];
}

function targetEntry(unitBody) {
  const match = unitBody.match(/<target([^>]*)>([\s\S]*?)<\/target>/);
  if (!match) return undefined;
  return {
    body: match[2],
    state: match[1].match(/\bstate="([^"]+)"/)?.[1] || 'needs-translation',
  };
}

function placeholderSequence(value) {
  return [...value.matchAll(/<x\b[^>]*\/>/g)].map((match) => match[0]);
}

function samePlaceholders(left, right) {
  return JSON.stringify(placeholderSequence(left)) === JSON.stringify(placeholderSequence(right));
}

const sourceXliff = readFileSync(SOURCE_PATH, 'utf8');
const sourceUnits = unitsById(sourceXliff);

for (const locale of selectedLocales) {
  if (!DEFAULT_LOCALES.includes(locale)) {
    throw new Error(`Unsupported locale ${locale}; expected one of ${DEFAULT_LOCALES.join(', ')}`);
  }

  const targetPath = `src/locale/messages.${locale}.xlf`;
  const targetXliff = readFileSync(targetPath, 'utf8');
  const targetUnits = unitsById(targetXliff);
  const targets = new Map();
  for (const [id, unit] of targetUnits) {
    const target = targetEntry(unit.body);
    if (target !== undefined) {
      targets.set(id, { ...target, source: sourceBody(unit.body, id) });
    }
  }

  let preserved = 0;
  let seeded = 0;
  let sourceChanged = 0;
  let placeholderReview = 0;
  let output = sourceXliff.replace(
    /<file source-language="en" datatype="plaintext" original="ng2\.template">/,
    `<file source-language="en" target-language="${locale}" datatype="plaintext" original="ng2.template">`,
  );

  output = output.replace(
    /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g,
    (wholeUnit, attributes, body) => {
      const id = attributes.match(/\bid="([^"]+)"/)?.[1];
      if (!id) throw new Error('Encountered a source <trans-unit> without an id attribute');
      const existing = targets.get(id);
      const source = sourceBody(body, id);
      const target = existing === undefined ? source : existing.body;
      let state = existing === undefined ? 'needs-translation' : existing.state;
      if (existing === undefined) {
        seeded += 1;
      } else {
        preserved += 1;
        if (existing.source !== source) {
          state = 'needs-translation';
          sourceChanged += 1;
        }
        if (!samePlaceholders(target, source)) {
          state = 'needs-translation';
          placeholderReview += 1;
        }
      }
      const patchedBody = body.replace(
        /(<\/source>)/,
        (sourceClose) => `${sourceClose}\n        <target state="${state}">${target}</target>`,
      );
      return `<trans-unit${attributes}>${patchedBody}</trans-unit>`;
    },
  );

  const orphanCount = [...targets.keys()].filter((id) => !sourceUnits.has(id)).length;
  const tempPath = `${targetPath}.tmp`;
  writeFileSync(tempPath, output, 'utf8');
  renameSync(tempPath, targetPath);
  console.log(
    `${locale}: preserved ${preserved}, seeded ${seeded}, source-changed ${sourceChanged}, `
    + `placeholder-review ${placeholderReview}, removed ${orphanCount} orphan units`,
  );
}
