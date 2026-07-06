/**
 * Phase 45 / Plan 01 -- reusable T1 port contract helpers.
 *
 * This module is tooling-only. It validates the evidence a future port must
 * collect before a descriptor can be treated as a safe T1 handler/recipe, and it
 * renders the checklist used by the scaffold CLI.
 */

'use strict';

export const PORT_TYPES = Object.freeze({
  SAME_ORIGIN_READ: 'same-origin-read',
  SAME_ORIGIN_WRITE: 'same-origin-write',
  GUARDED_WRITE: 'guarded-write',
  SEPARATE_ORIGIN_CANDIDATE: 'separate-origin-candidate',
});

export const EXECUTION_KINDS = Object.freeze({
  HANDLER: 'handler',
  RECIPE: 'recipe',
  CANDIDATE: 'candidate',
});

export const FALLBACK_CODE = 'RECIPE_DOM_FALLBACK_PENDING';

export const COMMON_PROOF_KEYS = Object.freeze([
  'originPin',
  'executeBoundSpecOnly',
  'noSecretLogging',
  'consentCompatibility',
  'routerParity',
  'fallbackByteStable',
  'noPerAppMcpTool',
  'noOpenTabsRuntime',
]);

export const BODY_GUARD_PROOF_KEYS = Object.freeze([
  'loggedOutGuard',
  'expectedShapeGuard',
]);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeString(value) {
  return String(value || '').trim();
}

export function normalizeSideEffectClass(value) {
  const v = normalizeString(value).toLowerCase();
  if (v === 'destructive' || v === 'delete') return 'destructive';
  if (v === 'write' || v === 'writes' || v === 'mutate' || v === 'mutating') return 'write';
  return 'read';
}

export function isValidOrigin(value) {
  try {
    const u = new URL(String(value || ''));
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === String(value).replace(/\/$/, '');
  } catch (_err) {
    return false;
  }
}

export function inferPortType(row) {
  const readiness = normalizeString(row && row.readiness);
  const route = normalizeString(row && row.routeFeasibility);
  const sideEffect = normalizeSideEffectClass(row && row.sideEffectClass);

  if (readiness === 't1-guarded-fail-closed') return PORT_TYPES.GUARDED_WRITE;
  if (route === 'pattern-d-candidate' || route === 'gapi-bridge-candidate' ||
      route === 'separate-origin-proven') {
    return PORT_TYPES.SEPARATE_ORIGIN_CANDIDATE;
  }
  if (sideEffect === 'read') return PORT_TYPES.SAME_ORIGIN_READ;
  return PORT_TYPES.SAME_ORIGIN_WRITE;
}

export function isWriteLike(sideEffectClass) {
  const c = normalizeSideEffectClass(sideEffectClass);
  return c === 'write' || c === 'destructive';
}

function requireTrue(failures, proofs, slug, key) {
  if (!proofs || proofs[key] !== true) {
    failures.push(slug + ' missing proof: ' + key);
  }
}

function validateFallbackShape(failures, contract, slug) {
  const fallback = contract.fallback || {};
  if (fallback.code !== FALLBACK_CODE) {
    failures.push(slug + ' fallback.code must be ' + FALLBACK_CODE);
  }
  if (fallback.dualField !== true) {
    failures.push(slug + ' fallback.dualField must be true');
  }
}

function validateWriteActivation(failures, contract, slug, sideEffect) {
  if (!isWriteLike(sideEffect)) return;
  const activation = contract.writeActivation || {};
  const status = normalizeString(activation.status);

  if (status === 'active') {
    if (activation.liveMutationUat !== true) {
      failures.push(slug + ' active write missing liveMutationUat evidence');
    }
    if (activation.mutationBodyShapeRecorded !== true) {
      failures.push(slug + ' active write missing redacted mutation body shape');
    }
    if (activation.auditRedactionProof !== true) {
      failures.push(slug + ' active write missing audit redaction proof');
    }
    return;
  }

  if (status === 'guarded-fail-closed') {
    requireTrue(failures, contract.proofs, slug, 'guardedWriteFailClosed');
    validateFallbackShape(failures, contract, slug);
    return;
  }

  failures.push(slug + ' write/destructive port must be active with UAT or guarded-fail-closed');
}

function validateSeparateOriginCandidate(failures, contract, slug) {
  const execution = contract.execution || {};
  if (execution.enabled !== false) {
    failures.push(slug + ' separate-origin candidate must have execution.enabled === false');
  }
  requireTrue(failures, contract.proofs, slug, 'negativeControlFailClosed');
  if (!normalizeString(contract.patternDDecision)) {
    failures.push(slug + ' separate-origin candidate missing patternDDecision');
  }
}

export function validatePortContract(contract, opts = {}) {
  const failures = [];
  if (!isObject(contract)) {
    return { failures: ['contract is not an object'] };
  }

  const slug = normalizeString(contract.slug) || '(unknown)';
  const portType = normalizeString(contract.portType);
  const sideEffect = normalizeSideEffectClass(contract.sideEffectClass);
  const execution = contract.execution || {};
  const proofs = contract.proofs || {};
  const legacyEvidence = opts.legacyEvidence === true || contract.legacyEvidence === true;

  if (!normalizeString(contract.slug)) failures.push('contract missing slug');
  if (!Object.values(PORT_TYPES).includes(portType)) {
    failures.push(slug + ' has invalid portType ' + portType);
  }
  if (!['read', 'write', 'destructive'].includes(sideEffect)) {
    failures.push(slug + ' has invalid sideEffectClass');
  }
  if (!Object.values(EXECUTION_KINDS).includes(normalizeString(execution.kind))) {
    failures.push(slug + ' has invalid execution.kind');
  }
  if (portType !== PORT_TYPES.SEPARATE_ORIGIN_CANDIDATE && !isValidOrigin(contract.origin)) {
    failures.push(slug + ' missing valid first-party origin');
  }

  if (!legacyEvidence) {
    for (const key of COMMON_PROOF_KEYS) requireTrue(failures, proofs, slug, key);
    if (portType === PORT_TYPES.SAME_ORIGIN_READ ||
        portType === PORT_TYPES.SAME_ORIGIN_WRITE ||
        portType === PORT_TYPES.GUARDED_WRITE) {
      for (const key of BODY_GUARD_PROOF_KEYS) requireTrue(failures, proofs, slug, key);
    }
  }

  if (portType === PORT_TYPES.GUARDED_WRITE) {
    if (!isWriteLike(sideEffect)) {
      failures.push(slug + ' guarded-write port must be write or destructive');
    }
    if (!contract.writeActivation) {
      contract = Object.assign({}, contract, {
        writeActivation: { status: 'guarded-fail-closed' },
      });
    }
  }

  if (portType === PORT_TYPES.SEPARATE_ORIGIN_CANDIDATE) {
    validateSeparateOriginCandidate(failures, contract, slug);
  } else {
    validateWriteActivation(failures, contract, slug, sideEffect);
  }

  return { failures };
}

export function validateHandlerSource(source, opts = {}) {
  const failures = [];
  const label = normalizeString(opts.slug || opts.handlerFile || 'handler');
  const text = String(source || '');

  if (/\bchrome\s*\.\s*(scripting|tabs)\b/.test(text)) {
    failures.push(label + ' references chrome.scripting/chrome.tabs directly');
  }
  if (/\b(browser|chrome)\s*\.\s*(cookies|webRequest)\b/.test(text)) {
    failures.push(label + ' references credential-bearing extension APIs directly');
  }
  if (/\bfetch\s*\(/.test(text) || /\bXMLHttpRequest\s*\(/.test(text)) {
    failures.push(label + ' performs direct network fetch instead of executeBoundSpec');
  }
  if (/\beval\s*\(/.test(text) || /\bnew\s+Function\s*\(/.test(text)) {
    failures.push(label + ' uses dynamic code execution');
  }
  if (/console\.\w+\([^)]*\b(token|secret|cookie|csrf|xoxc|xoxd|authorization|bearer)\b/i.test(text)) {
    failures.push(label + ' console-logs a secret-bearing identifier');
  }

  return { failures };
}

export function makeRecordingCtx(origin = 'https://example.com') {
  const recorder = [];
  return {
    recorder,
    ctx: {
      origin,
      tabId: 99,
      async executeBoundSpec(spec, tabId) {
        recorder.push({ spec, tabId });
        return { success: true, status: 200, data: { ok: true }, text: null };
      },
    },
  };
}

export function isDualFallback(result, code = FALLBACK_CODE) {
  return !!result &&
    result.success === false &&
    result.code === code &&
    result.errorCode === code &&
    result.error === code;
}

export async function validateGuardedWriteRows(rows, opts = {}) {
  const failures = [];
  const list = Array.isArray(rows) ? rows : [];
  const loadHandler = opts.loadHandler;
  const invokeArgs = opts.invokeArgs || {};

  if (typeof loadHandler !== 'function') {
    return { failures: ['validateGuardedWriteRows requires opts.loadHandler'] };
  }

  for (const row of list) {
    const slug = normalizeString(row && row.slug) || '(unknown)';
    const sideEffect = normalizeSideEffectClass(row && row.sideEffectClass);
    if (!isWriteLike(sideEffect)) {
      failures.push(slug + ' guarded row is not write/destructive');
      continue;
    }

    let entry;
    try {
      entry = await loadHandler(row);
    } catch (err) {
      failures.push(slug + ' handler load threw: ' + (err && err.message ? err.message : String(err)));
      continue;
    }

    if (!entry || typeof entry.handle !== 'function') {
      failures.push(slug + ' missing guarded handler entry');
      continue;
    }

    const rec = makeRecordingCtx(row.runtimeOrigin || row.origin || 'https://example.com');
    let result;
    try {
      result = await entry.handle(invokeArgs[slug] || {}, rec.ctx);
    } catch (err) {
      failures.push(slug + ' guarded handler threw: ' + (err && err.message ? err.message : String(err)));
      continue;
    }

    if (!isDualFallback(result)) {
      failures.push(slug + ' guarded handler did not return byte-stable ' + FALLBACK_CODE);
    }
    if (result && result.fellBackToDom !== true) {
      failures.push(slug + ' guarded handler missing fellBackToDom marker');
    }
    if (rec.recorder.length !== 0) {
      failures.push(slug + ' guarded handler called executeBoundSpec ' + rec.recorder.length + ' time(s)');
    }
  }

  return { failures };
}

export function contractFromReadinessRow(row, opts = {}) {
  const r = row || {};
  const portType = opts.portType || inferPortType(r);
  const sideEffectClass = normalizeSideEffectClass(r.sideEffectClass);
  const isCandidate = portType === PORT_TYPES.SEPARATE_ORIGIN_CANDIDATE;
  return {
    slug: normalizeString(r.slug),
    app: normalizeString(r.app),
    service: normalizeString(r.service),
    portType,
    sideEffectClass,
    origin: normalizeString(opts.origin || r.runtimeOrigin),
    execution: {
      kind: isCandidate ? EXECUTION_KINDS.CANDIDATE : normalizeString(r.proof || EXECUTION_KINDS.HANDLER),
      enabled: !isCandidate,
    },
    proofs: {
      originPin: false,
      executeBoundSpecOnly: false,
      loggedOutGuard: false,
      expectedShapeGuard: false,
      noSecretLogging: false,
      consentCompatibility: false,
      routerParity: false,
      fallbackByteStable: false,
      noPerAppMcpTool: true,
      noOpenTabsRuntime: true,
      guardedWriteFailClosed: portType === PORT_TYPES.GUARDED_WRITE ? false : undefined,
      negativeControlFailClosed: isCandidate ? false : undefined,
    },
    fallback: {
      code: FALLBACK_CODE,
      dualField: false,
    },
    writeActivation: isWriteLike(sideEffectClass) && !isCandidate
      ? { status: portType === PORT_TYPES.GUARDED_WRITE ? 'guarded-fail-closed' : 'active' }
      : undefined,
    patternDDecision: isCandidate ? '' : undefined,
  };
}

function checkbox(done, label) {
  return '- [' + (done ? 'x' : ' ') + '] ' + label;
}

function contractJsonBlock(contract) {
  return '```json\n' + JSON.stringify(contract, null, 2) + '\n```';
}

function typeDescription(portType) {
  if (portType === PORT_TYPES.SAME_ORIGIN_READ) return 'Same-origin read';
  if (portType === PORT_TYPES.SAME_ORIGIN_WRITE) return 'Same-origin write';
  if (portType === PORT_TYPES.GUARDED_WRITE) return 'Guarded write';
  if (portType === PORT_TYPES.SEPARATE_ORIGIN_CANDIDATE) return 'Separate-origin candidate';
  return 'Unknown';
}

export function renderT1PortChecklist(row, opts = {}) {
  const contract = contractFromReadinessRow(row, opts);
  const slug = contract.slug || normalizeString(opts.slug) || 'new.capability';
  const portType = contract.portType;
  const isCandidate = portType === PORT_TYPES.SEPARATE_ORIGIN_CANDIDATE;
  const isWrite = isWriteLike(contract.sideEffectClass);

  const lines = [
    '# T1 Port Checklist: ' + slug,
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| Type | ' + typeDescription(portType) + ' |',
    '| Side effect | ' + contract.sideEffectClass + ' |',
    '| Origin | ' + (contract.origin || 'TBD') + ' |',
    '| Service | ' + (contract.service || 'TBD') + ' |',
    '',
    '## Required Proofs',
    '',
    checkbox(false, 'Origin pin: every spec uses the first-party runtime origin and rejects origin mismatch before execution.'),
    checkbox(false, '`executeBoundSpec` only: handler does not call `chrome.scripting`, `chrome.tabs`, direct `fetch`, XHR, cookie APIs, or dynamic code.'),
    checkbox(false, 'Closed params: schema has `additionalProperties:false` and all path/body fields are explicit.'),
    checkbox(false, 'Logged-out guard: a signed-out/redirect/auth-error body cannot be reported as success.'),
    checkbox(false, 'Expected shape guard: success requires the app-specific body envelope, not just HTTP 200.'),
    checkbox(false, 'No secret logging: token/cookie/CSRF values stay inside the bound spec and never enter console/audit diagnostics.'),
    checkbox(false, 'Consent compatibility: denylisted origins remain blocked; sensitive origins are flagged/audited under current invoke semantics.'),
    checkbox(false, 'Router parity: the exact descriptor slug resolves through `capability-catalog.resolve()` and both MCP/autopilot front doors use the router.'),
    checkbox(false, 'Fallback byte stability: fallback returns `code === errorCode === error === "' + FALLBACK_CODE + '"` where applicable.'),
    checkbox(true, 'MCP surface unchanged: no per-app tool is added; use `search_capabilities`/`invoke_capability`.'),
    checkbox(true, 'Wall 1 unchanged: no OpenTabs runtime/plugin code ships.'),
    '',
  ];

  if (isWrite && !isCandidate) {
    lines.push('## Write Gate');
    lines.push('');
    if (portType === PORT_TYPES.GUARDED_WRITE) {
      lines.push(checkbox(false, 'Guarded handler returns fail-closed without calling `executeBoundSpec`.'));
      lines.push(checkbox(false, 'Mutation activation remains blocked until live UAT records method/path/body shape and redacted token/CSRF carrier location.'));
    } else {
      lines.push(checkbox(false, 'Live mutation UAT recorded method/path/body shape with secrets redacted.'));
      lines.push(checkbox(false, 'Audit redaction proof recorded for success and failure responses.'));
      lines.push(checkbox(false, 'Mutation retry/ambiguous outcome behavior verified.'));
    }
    lines.push('');
  }

  if (isCandidate) {
    lines.push('## Separate-Origin Candidate Gate');
    lines.push('');
    lines.push(checkbox(false, 'Execution disabled until Pattern-D/GAPI design is approved.'));
    lines.push(checkbox(false, 'Negative-control test proves cross-origin execution fails closed.'));
    lines.push(checkbox(false, 'Decision recorded: same-origin impossible, Pattern-D candidate, GAPI candidate, or rejected.'));
    lines.push('');
  }

  lines.push('## Starter Contract');
  lines.push('');
  lines.push(contractJsonBlock(contract));
  lines.push('');
  lines.push('## Focused Commands');
  lines.push('');
  lines.push('```bash');
  lines.push('node tests/capability-head-handlers.test.js');
  lines.push('node tests/head-handler-upgrade.test.js');
  lines.push('node tests/guarded-write-failclosed.test.js');
  lines.push('node scripts/verify-t1-port-contract.mjs');
  lines.push('npm run validate:extension');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
