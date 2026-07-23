#!/usr/bin/env node
// Reject locale catalogs that only look complete because English source copy was
// stored in <target state="translated">. The older drift check intentionally
// validates mirrored <source> currency; this gate validates target content and
// placeholder integrity.

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = process.cwd();
const LOCALE_DIR = join(ROOT, 'src', 'locale');
const LOCALE_CONSTANTS_PATH = join(ROOT, 'src', 'app', 'core', 'i18n', 'locale-constants.ts');
const SOURCE_FILE = join(LOCALE_DIR, 'messages.xlf');
const ALLOWLIST_FILE = join(LOCALE_DIR, 'same-source-allowlist.json');
const INVARIANT_TECHNICAL_LITERALS = [
  'FSB',
  'PhantomStream',
  'Lattice',
  'Prometheus',
  'Playwright',
  'OpenAI',
  'OpenRouter',
  'Chrome',
  'Chromium',
  'GitHub',
  'MCP',
  'DOM',
  'API',
  'JavaScript',
  'TypeScript',
  'WebSocket',
  'AES-GCM',
  'PBKDF2',
  'Ed25519',
  'DSSE',
  'JCS',
  'CSP',
  'CDP',
  'HTTP',
  'GDPR',
  'UUID',
  'DevTools',
  'LM Studio',
  'Claude',
  'Codex',
  'OpenClaw',
  'Hermes',
  'Grok',
  'Node 20',
  'Node 24',
  'node20',
  'node24',
];

function failTool(message) {
  console.error(`FATAL: ${message}`);
  process.exit(2);
}

function read(path, label) {
  if (!existsSync(path)) failTool(`${label} missing: ${path}`);
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    failTool(`cannot read ${label} (${path}): ${(error && error.message) || error}`);
  }
}

function extractLocales(text) {
  const match = text.match(/LOCALES\s*[:=]\s*\[([^\]]+)\]/);
  if (!match) failTool(`could not find LOCALES in ${LOCALE_CONSTANTS_PATH}`);
  return match[1]
    .split(',')
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function extractSourceLocale(text) {
  const match = text.match(/SOURCE_LOCALE\s*=\s*['"]([^'"]+)['"]/);
  if (!match) failTool(`could not find SOURCE_LOCALE in ${LOCALE_CONSTANTS_PATH}`);
  return match[1];
}

function extractUnits(text, label) {
  const units = new Map();
  const unitRe = /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g;
  let match;
  while ((match = unitRe.exec(text)) !== null) {
    const [, attributes, body] = match;
    const id = attributes.match(/\bid="([^"]+)"/)?.[1];
    if (!id) failTool(`${label} contains a trans-unit without an id attribute`);
    const source = body.match(/<source>([\s\S]*?)<\/source>/)?.[1];
    const targetMatch = body.match(/<target([^>]*)>([\s\S]*?)<\/target>/);
    const target = targetMatch?.[2];
    const targetState = targetMatch?.[1].match(/\bstate="([^"]+)"/)?.[1];
    if (source === undefined) failTool(`${label} trans-unit ${id} has no <source>`);
    if (units.has(id)) failTool(`${label} contains duplicate trans-unit id ${id}`);
    units.set(id, { source, target, targetState });
  }
  if (units.size === 0) failTool(`${label} contains no trans-units`);
  return units;
}

function canonicalXml(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function decodeXmlEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|lt|gt|amp|quot|apos|nbsp);/gi, (entity, name) => {
    const normalized = name.toLowerCase();
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'amp') return '&';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    if (normalized === 'nbsp') return ' ';
    const codePoint = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    try {
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    } catch {
      return entity;
    }
  });
}

function visibleText(value) {
  return decodeXmlEntities(value
    .replace(/<x\b[^>]*\/>/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparisonKey(value) {
  return visibleText(value)
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim();
}

function sourceHash(value) {
  return createHash('sha256').update(canonicalXml(value)).digest('hex');
}

function placeholderSequence(value) {
  return [...value.matchAll(/<x\b[^>]*\/>/g)].map((match) => match[0]);
}

function protectedLiteralSequence(value) {
  const placeholders = [...value.matchAll(/<x\b[^>]*\/>/g)];
  const literals = [];
  for (let index = 0; index < placeholders.length; index += 1) {
    const start = placeholders[index];
    const decodedPlaceholder = decodeXmlEntities(start[0]);
    const protectsLiteral = /\[attr\.translate\]\s*=\s*["']*no["']*/i.test(decodedPlaceholder)
      || /\btranslate\s*=\s*["']no["']/i.test(decodedPlaceholder);
    if (!protectsLiteral) continue;
    const startId = start[0].match(/\bid="([^"]+)"/)?.[1] || '';
    const startKind = startId.replace(/^START_/, '').replace(/_\d+$/, '');
    let depth = 1;
    let close;
    for (let candidateIndex = index + 1; candidateIndex < placeholders.length; candidateIndex += 1) {
      const candidate = placeholders[candidateIndex];
      const candidateId = candidate[0].match(/\bid="([^"]+)"/)?.[1] || '';
      const candidateKind = candidateId.replace(/^(?:START|CLOSE)_/, '').replace(/_\d+$/, '');
      if (candidateKind !== startKind) continue;
      if (candidateId.startsWith('START_')) depth += 1;
      if (candidateId.startsWith('CLOSE_')) depth -= 1;
      if (depth === 0) {
        close = candidate;
        break;
      }
    }
    if (!startId.startsWith('START_') || !close) {
      literals.push({ literal: '', malformed: true, tagName: '' });
      continue;
    }
    const literalStart = (start.index || 0) + start[0].length;
    const placeholderTag = startId
      .replace(/^START_TAG_+/, '')
      .replace(/_\d+$/, '')
      .split('_')
      .at(-1)
      ?.toLocaleLowerCase('en-US') || '';
    literals.push({
      literal: visibleText(value.slice(literalStart, close.index)),
      malformed: false,
      tagName: placeholderTag,
    });
  }
  return literals;
}

function overbroadProtectedProse(protectedLiterals) {
  const codeElements = new Set(['code', 'kbd', 'pre', 'samp']);
  return protectedLiterals
    .filter(({ literal, malformed, tagName }) => {
      if (malformed || codeElements.has(tagName)) return false;
      const words = literal.match(/[a-z][a-z'-]*/gi) || [];
      return words.length >= 5;
    })
    .map(({ literal }) => literal);
}

function hasReadableContent(value) {
  return /\p{L}{2}/u.test(visibleText(value));
}

function hasMeaningfulContent(value) {
  return /[\p{L}\p{N}]/u.test(visibleText(value));
}

function translatorArtifact(source, target) {
  const targetText = visibleText(target);
  const artifact = targetText.match(
    /[（(]\s*(?:法语|法文|韩语|韩文|中文(?:\s*[（(]中国大陆)?|英语|英文|日语|日文|德语|德文|西班牙语|西语|spanish|german|japanese|(?:simplified |traditional )?chinese|english|french|korean|[EQ]\s*[)）])/iu,
  )?.[0];
  if (!artifact) return undefined;
  return visibleText(source).includes(artifact) ? undefined : artifact;
}

function hasUnbalancedParentheses(value) {
  let depth = 0;
  for (const character of visibleText(value)) {
    if (character === '(' || character === '（') depth += 1;
    if (character !== ')' && character !== '）') continue;
    depth -= 1;
    if (depth < 0) return true;
  }
  return depth !== 0;
}

function missingInvariantTechnicalLiterals(source, target) {
  const sourceText = visibleText(source);
  const targetText = visibleText(target);
  return INVARIANT_TECHNICAL_LITERALS.filter(
    (literal) => sourceText.includes(literal) && !targetText.includes(literal),
  );
}

function copiedEnglishNgram(source, target) {
  const commonEnglishWords = new Set([
    'and', 'are', 'been', 'can', 'could', 'does', 'for', 'from', 'has', 'have', 'how', 'into',
    'its', 'may', 'more', 'most', 'not', 'our', 'should', 'than', 'that', 'the', 'their', 'them',
    'then', 'there', 'these', 'they', 'this', 'under', 'was', 'were', 'what', 'when', 'where',
    'which', 'who', 'will', 'with', 'would', 'you', 'your',
  ]);
  const sourceWords = visibleText(source).toLocaleLowerCase('en-US').match(/[a-z][a-z'-]{2,}/g) || [];
  if (sourceWords.length < 10) return undefined;
  const targetWords = visibleText(target).toLocaleLowerCase('en-US').match(/[a-z][a-z'-]{2,}/g) || [];
  if (targetWords.length < 5) return undefined;
  const targetText = ` ${targetWords.join(' ')} `;
  for (let index = 0; index <= sourceWords.length - 5; index += 1) {
    const words = sourceWords.slice(index, index + 5);
    if (words.filter((word) => commonEnglishWords.has(word)).length < 2) continue;
    const phrase = words.join(' ');
    if (targetText.includes(` ${phrase} `)) return phrase;
  }
  return undefined;
}

function parseAllowlist(text, sourceUnits, targetLocales) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    failTool(`invalid JSON in ${ALLOWLIST_FILE}: ${(error && error.message) || error}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    failTool(`allowlist root in ${ALLOWLIST_FILE} must be an object`);
  }
  if (!Array.isArray(parsed.allLocales)) {
    failTool('allowlist field allLocales must be an array');
  }
  if (
    parsed.byLocale !== undefined
    && (!parsed.byLocale || typeof parsed.byLocale !== 'object' || Array.isArray(parsed.byLocale))
  ) {
    failTool('allowlist field byLocale must be an object');
  }
  if (
    parsed.equivalentByLocale !== undefined
    && (
      !parsed.equivalentByLocale
      || typeof parsed.equivalentByLocale !== 'object'
      || Array.isArray(parsed.equivalentByLocale)
    )
  ) {
    failTool('allowlist field equivalentByLocale must be an object');
  }

  const all = new Map();
  const byLocale = new Map();
  const equivalentByLocale = new Map();
  const failures = [];
  const localeEntries = parsed.byLocale || {};
  const equivalentLocaleEntries = parsed.equivalentByLocale || {};

  for (const locale of new Set([
    ...Object.keys(localeEntries),
    ...Object.keys(equivalentLocaleEntries),
  ])) {
    if (!targetLocales.includes(locale)) failures.push(`allowlist has unknown locale ${locale}`);
  }

  function parseEntries(scope, entries) {
    if (!Array.isArray(entries)) failTool(`allowlist field ${scope} must be an array`);
    const result = new Map();
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        failures.push(`allowlist ${scope} contains a non-object entry`);
        continue;
      }
      const { id, sourceSha256, reason } = entry;
      if (typeof id !== 'string' || id.length === 0) {
        failures.push(`allowlist ${scope} entry has a non-string or empty id`);
        continue;
      }
      if (result.has(id)) failures.push(`duplicate allowlist entry ${scope}:${id}`);
      result.set(id, entry);
      if (!sourceUnits.has(id)) {
        failures.push(`allowlist ${scope} references non-active id ${id}`);
        continue;
      }
      if (typeof sourceSha256 !== 'string' || !/^[\da-f]{64}$/.test(sourceSha256)) {
        failures.push(`allowlist ${scope}:${id} has an invalid sourceSha256`);
      } else {
        const currentHash = sourceHash(sourceUnits.get(id).source);
        if (sourceSha256 !== currentHash) {
          failures.push(`allowlist ${scope}:${id} sourceSha256 is stale`);
        }
      }
      if (typeof reason !== 'string' || reason.trim().length < 3) {
        failures.push(`allowlist ${scope}:${id} must include a concise reason`);
      }
    }
    return result;
  }

  function parseEquivalentEntries(scope, entries) {
    if (!Array.isArray(entries)) failTool(`allowlist field ${scope} must be an array`);
    const result = new Map();
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        failures.push(`allowlist ${scope} contains a non-object entry`);
        continue;
      }
      const {
        id,
        sourceSha256,
        targetSha256,
        reason,
      } = entry;
      if (typeof id !== 'string' || id.length === 0) {
        failures.push(`allowlist ${scope} entry has a non-string or empty id`);
        continue;
      }
      if (result.has(id)) failures.push(`duplicate allowlist entry ${scope}:${id}`);
      result.set(id, entry);
      if (!sourceUnits.has(id)) {
        failures.push(`allowlist ${scope} references non-active id ${id}`);
        continue;
      }
      if (typeof sourceSha256 !== 'string' || !/^[\da-f]{64}$/.test(sourceSha256)) {
        failures.push(`allowlist ${scope}:${id} has an invalid sourceSha256`);
      } else if (sourceSha256 !== sourceHash(sourceUnits.get(id).source)) {
        failures.push(`allowlist ${scope}:${id} sourceSha256 is stale`);
      }
      if (typeof targetSha256 !== 'string' || !/^[\da-f]{64}$/.test(targetSha256)) {
        failures.push(`allowlist ${scope}:${id} has an invalid targetSha256`);
      }
      if (typeof reason !== 'string' || reason.trim().length < 3) {
        failures.push(`allowlist ${scope}:${id} must include a concise reason`);
      }
    }
    return result;
  }

  for (const [id, entry] of parseEntries('allLocales', parsed.allLocales)) all.set(id, entry);
  for (const locale of targetLocales) {
    const entries = parseEntries(`byLocale.${locale}`, localeEntries[locale] || []);
    byLocale.set(locale, entries);
    for (const id of entries.keys()) {
      if (all.has(id)) failures.push(`allowlist byLocale.${locale} redundantly repeats allLocales id ${id}`);
    }

    const equivalentEntries = parseEquivalentEntries(
      `equivalentByLocale.${locale}`,
      equivalentLocaleEntries[locale] || [],
    );
    equivalentByLocale.set(locale, equivalentEntries);
    for (const id of equivalentEntries.keys()) {
      if (all.has(id) || entries.has(id)) {
        failures.push(
          `allowlist equivalentByLocale.${locale} conflicts with an exact-copy entry for id ${id}`,
        );
      }
    }
  }

  return {
    all,
    byLocale,
    equivalentByLocale,
    failures,
    permits(locale, id, source) {
      const entry = all.get(id) || byLocale.get(locale)?.get(id);
      return entry?.sourceSha256 === sourceHash(source);
    },
    permitsEquivalent(locale, id, source, target) {
      const entry = equivalentByLocale.get(locale)?.get(id);
      return entry?.sourceSha256 === sourceHash(source)
        && entry?.targetSha256 === sourceHash(target);
    },
  };
}

function main() {
  const registryText = read(LOCALE_CONSTANTS_PATH, 'locale registry');
  const locales = extractLocales(registryText);
  const sourceLocale = extractSourceLocale(registryText);
  const targetLocales = locales.filter((locale) => locale !== sourceLocale);
  if (targetLocales.length === 0) failTool('locale registry contains no target locales');

  const sourceUnits = extractUnits(read(SOURCE_FILE, 'source XLIFF'), 'source XLIFF');
  const failures = [];
  const targetUnits = new Map();
  for (const locale of targetLocales) {
    const path = join(LOCALE_DIR, `messages.${locale}.xlf`);
    const units = extractUnits(read(path, `${locale} XLIFF`), `${locale} XLIFF`);
    targetUnits.set(locale, units);
    for (const id of units.keys()) {
      if (!sourceUnits.has(id)) failures.push(`[${locale}] ${id}: orphan trans-unit`);
    }
  }

  const allowlist = parseAllowlist(
    read(ALLOWLIST_FILE, 'same-source allowlist'),
    sourceUnits,
    targetLocales,
  );
  failures.push(...allowlist.failures);
  const copiedCounts = new Map(targetLocales.map((locale) => [locale, 0]));
  const sourceEqualByLocale = new Map(targetLocales.map((locale) => [locale, new Set()]));

  for (const [id, sourceUnit] of sourceUnits) {
    const source = canonicalXml(sourceUnit.source);
    const sourceCopyKey = comparisonKey(sourceUnit.source);
    const sourceIsReadable = hasReadableContent(sourceUnit.source);
    const sourcePlaceholders = placeholderSequence(sourceUnit.source);
    const sourceProtectedLiterals = protectedLiteralSequence(sourceUnit.source);
    const targetsForId = [];

    for (const literal of overbroadProtectedProse(sourceProtectedLiterals)) {
      failures.push(
        `[source] ${id}: translate=no protects likely translatable prose "${literal}"`,
      );
    }

    for (const locale of targetLocales) {
      const unit = targetUnits.get(locale).get(id);
      if (!unit) {
        failures.push(`[${locale}] ${id}: missing trans-unit`);
        continue;
      }
      if (canonicalXml(unit.source) !== source) {
        failures.push(`[${locale}] ${id}: mirrored source drift`);
      }
      if (unit.target === undefined || canonicalXml(unit.target) === '') {
        failures.push(`[${locale}] ${id}: missing or empty target`);
        continue;
      }
      if (sourceIsReadable && !hasMeaningfulContent(unit.target)) {
        failures.push(`[${locale}] ${id}: target has no visible letters or numbers`);
      }
      if (unit.targetState !== 'translated') {
        failures.push(`[${locale}] ${id}: target state is ${unit.targetState || 'missing'}, expected translated`);
      }

      const artifact = translatorArtifact(sourceUnit.source, unit.target);
      if (artifact) {
        failures.push(`[${locale}] ${id}: target contains translator artifact "${artifact}"`);
      }
      if (hasUnbalancedParentheses(unit.target)) {
        failures.push(`[${locale}] ${id}: target contains unbalanced parentheses`);
      }
      for (const literal of missingInvariantTechnicalLiterals(sourceUnit.source, unit.target)) {
        failures.push(`[${locale}] ${id}: target must preserve technical literal "${literal}"`);
      }

      const target = canonicalXml(unit.target);
      const targetCopyKey = comparisonKey(unit.target);
      targetsForId.push({ locale, target, targetCopyKey });
      const targetPlaceholders = placeholderSequence(unit.target);
      if (JSON.stringify(targetPlaceholders) !== JSON.stringify(sourcePlaceholders)) {
        failures.push(`[${locale}] ${id}: placeholder markup or order differs from source`);
      }
      const targetProtectedLiterals = protectedLiteralSequence(unit.target);
      if (JSON.stringify(targetProtectedLiterals) !== JSON.stringify(sourceProtectedLiterals)) {
        failures.push(`[${locale}] ${id}: protected translate=no literal differs from source`);
      }

      const exactSourceCopy = sourceIsReadable && target === source;
      if (exactSourceCopy) sourceEqualByLocale.get(locale).add(id);
      const effectiveSourceCopy = sourceIsReadable
        && sourceCopyKey.length > 0
        && targetCopyKey === sourceCopyKey;
      if (effectiveSourceCopy) {
        const isApproved = exactSourceCopy
          ? allowlist.permits(locale, id, sourceUnit.source)
          : allowlist.permitsEquivalent(locale, id, sourceUnit.source, unit.target);
        if (!isApproved) {
          copiedCounts.set(locale, copiedCounts.get(locale) + 1);
          failures.push(
            `[${locale}] ${id}: target ${exactSourceCopy ? 'copies' : 'effectively copies'} English source`,
          );
        }
      } else if (sourceIsReadable) {
        const copiedPhrase = copiedEnglishNgram(sourceUnit.source, unit.target);
        if (copiedPhrase) {
          copiedCounts.set(locale, copiedCounts.get(locale) + 1);
          failures.push(`[${locale}] ${id}: target retains English phrase "${copiedPhrase}"`);
        }
      }
    }

    if (
      targetLocales.length > 1
      &&
      targetsForId.length === targetLocales.length
      && sourceIsReadable
      && new Set(targetsForId.map(({ targetCopyKey }) => targetCopyKey)).size === 1
    ) {
      const allCopySourceExactly = targetsForId.every(({ target }) => target === source);
      if (
        !allCopySourceExactly
        || !allowlist.all.has(id)
        || !targetsForId.every(({ locale }) => allowlist.permits(locale, id, sourceUnit.source))
      ) {
        failures.push(`[all locales] ${id}: every locale has the same target`);
      }
    }
  }

  for (const id of allowlist.all.keys()) {
    const sourceEqualEverywhere = targetLocales.every((locale) => sourceEqualByLocale.get(locale).has(id));
    if (!sourceEqualEverywhere) {
      failures.push(`allowlist allLocales entry is stale or overbroad: ${id}`);
    }
  }
  for (const [locale, ids] of allowlist.byLocale) {
    for (const id of ids.keys()) {
      if (!sourceEqualByLocale.get(locale).has(id)) {
        failures.push(`allowlist byLocale.${locale} entry is stale: ${id}`);
      }
    }
  }
  for (const [locale, entries] of allowlist.equivalentByLocale) {
    for (const [id, entry] of entries) {
      const sourceUnit = sourceUnits.get(id);
      const targetUnit = targetUnits.get(locale).get(id);
      if (!sourceUnit || targetUnit?.target === undefined) continue;
      const isNonExactEquivalent = hasReadableContent(sourceUnit.source)
        && canonicalXml(targetUnit.target) !== canonicalXml(sourceUnit.source)
        && comparisonKey(targetUnit.target) === comparisonKey(sourceUnit.source);
      if (!isNonExactEquivalent) {
        failures.push(`allowlist equivalentByLocale.${locale} entry is stale or overbroad: ${id}`);
      } else if (entry.targetSha256 !== sourceHash(targetUnit.target)) {
        failures.push(`allowlist equivalentByLocale.${locale}:${id} targetSha256 is stale`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`Translation quality check failed with ${failures.length} issue(s).`);
    for (const failure of failures.slice(0, 120)) console.error(`  - ${failure}`);
    if (failures.length > 120) console.error(`  ... and ${failures.length - 120} more`);
    for (const locale of targetLocales) {
      console.error(`  [${locale}] unapproved English-copy targets: ${copiedCounts.get(locale)}`);
    }
    process.exit(1);
  }

  console.log(
    `Translation quality check passed: ${sourceUnits.size} active units × ${targetLocales.length} locales; `
    + 'no unapproved English-copy/shared targets and placeholder order is intact.',
  );
}

main();
