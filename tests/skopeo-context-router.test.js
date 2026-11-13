/**
 * Closed context-router contract for Phase 53.
 *
 * Oracle only (must pass before production exists):
 *   node tests/skopeo-context-router.test.js --self-test
 *
 * Production contract (must fail explicitly until the router exists):
 *   node tests/skopeo-context-router.test.js
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SELF_TEST = process.argv.includes('--self-test');
const ROUTER_PATH = path.resolve(
  __dirname,
  '..',
  'extension',
  'content',
  'skopeo-context-router.js'
);

const DRIVE_ORIGIN = 'https://drive.google.com';
const DOCS_ORIGIN = 'https://docs.google.com';
const MAX_URL_LENGTH = 4096;
const MAX_VALUE_LENGTH = 512;
const MAX_EVIDENCE = 8;

function createContractOracle() {
  const STATUS = Object.freeze({
    RECOGNIZED: 'recognized',
    UNCERTAIN: 'uncertain',
    UNSUPPORTED: 'unsupported'
  });
  const CONTEXT_KIND = Object.freeze({
    CONFIGURED_CORPUS: 'configured-corpus',
    VENDOR_FOLDER: 'vendor-folder',
    AGREEMENT_READING: 'agreement-reading',
    FOCUSED_ASK: 'focused-ask'
  });
  const IDENTITY_KIND = Object.freeze({
    DRIVE_FOLDER: 'drive-folder',
    DRIVE_FILE: 'drive-file',
    DOCS_DOCUMENT: 'docs-document',
    OPAQUE_TARGET: 'opaque-target'
  });
  const REASON = Object.freeze({
    CONTEXT_EVIDENCE_MISSING: 'context-evidence-missing',
    CONTEXT_EVIDENCE_CONFLICT: 'context-evidence-conflict',
    CONTEXT_KIND_UNSUPPORTED: 'context-kind-unsupported',
    ORIGIN_UNSUPPORTED: 'origin-unsupported',
    ROUTE_MALFORMED: 'route-malformed',
    ROUTER_DISPOSED: 'router-disposed'
  });
  const SIGNAL = Object.freeze({
    EXACT_ORIGIN: 'exact-origin',
    TRUSTED_CONTEXT_KIND: 'trusted-context-kind',
    DRIVE_ITEM_ID: 'drive-item-id',
    DOCS_DOCUMENT_ID: 'docs-document-id',
    OPAQUE_TARGET_KEY: 'opaque-target-key'
  });

  const CONTEXT_VALUES = Object.freeze(Object.values(CONTEXT_KIND));
  const IDENTITY_VALUES = Object.freeze(Object.values(IDENTITY_KIND));
  const SIGNAL_VALUES = Object.freeze(Object.values(SIGNAL));

  function exactKeys(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some(key => typeof key !== 'string')) return false;
    const actual = ownKeys.sort();
    const expected = keys.slice().sort();
    return actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]);
  }

  function safeString(value, limit) {
    return typeof value === 'string' && value.length > 0 && value.length <= limit &&
      /^[A-Za-z0-9._:-]+$/.test(value);
  }

  function validEvidenceValue(signal, value) {
    if (signal === SIGNAL.EXACT_ORIGIN) {
      return value === DRIVE_ORIGIN || value === DOCS_ORIGIN;
    }
    if (signal === SIGNAL.TRUSTED_CONTEXT_KIND) {
      return CONTEXT_VALUES.includes(value);
    }
    return safeString(value, MAX_VALUE_LENGTH);
  }

  function frozenFailure(status, contextEpoch, reason, retryable) {
    return Object.freeze({ status, contextEpoch, reason, retryable });
  }

  function createRouter(options) {
    if (!exactKeys(options, ['generation']) ||
        typeof options.generation !== 'number' ||
        !Number.isSafeInteger(options.generation) ||
        options.generation <= 0) {
      throw new TypeError('generation must be a positive safe integer');
    }

    let epoch = 0;
    let disposed = false;

    function fail(reason) {
      const uncertain = reason === REASON.CONTEXT_EVIDENCE_MISSING ||
        reason === REASON.CONTEXT_EVIDENCE_CONFLICT;
      return frozenFailure(
        uncertain ? STATUS.UNCERTAIN : STATUS.UNSUPPORTED,
        epoch,
        reason,
        uncertain
      );
    }

    function route(input) {
      if (epoch >= Number.MAX_SAFE_INTEGER) return fail(REASON.ROUTE_MALFORMED);
      epoch += 1;
      if (disposed) return fail(REASON.ROUTER_DISPOSED);
      if (!exactKeys(input, ['url', 'contextKind', 'semanticIdentity', 'evidence'])) {
        return fail(REASON.ROUTE_MALFORMED);
      }
      if (typeof input.url !== 'string' || input.url.length === 0 ||
          input.url.length > MAX_URL_LENGTH) {
        return fail(REASON.ROUTE_MALFORMED);
      }
      if (!CONTEXT_VALUES.includes(input.contextKind)) {
        return fail(REASON.CONTEXT_KIND_UNSUPPORTED);
      }

      let parsed;
      try {
        parsed = new URL(input.url);
      } catch (_error) {
        return fail(REASON.ROUTE_MALFORMED);
      }
      if (parsed.origin !== DRIVE_ORIGIN && parsed.origin !== DOCS_ORIGIN) {
        return fail(REASON.ORIGIN_UNSUPPORTED);
      }
      if (input.semanticIdentity === null || input.semanticIdentity === undefined) {
        return fail(REASON.CONTEXT_EVIDENCE_MISSING);
      }
      if (!exactKeys(input.semanticIdentity, ['kind', 'id'])) return fail(REASON.ROUTE_MALFORMED);
      if (!IDENTITY_VALUES.includes(input.semanticIdentity.kind) ||
          !safeString(input.semanticIdentity.id, MAX_VALUE_LENGTH)) {
        return fail(REASON.ROUTE_MALFORMED);
      }
      if (!Array.isArray(input.evidence) || input.evidence.length > MAX_EVIDENCE) {
        return fail(REASON.ROUTE_MALFORMED);
      }

      const evidenceBySignal = new Map();
      for (const item of input.evidence) {
        if (!exactKeys(item, ['signal', 'value']) || !SIGNAL_VALUES.includes(item.signal) ||
            !validEvidenceValue(item.signal, item.value)) {
          return fail(REASON.ROUTE_MALFORMED);
        }
        if (evidenceBySignal.has(item.signal) && evidenceBySignal.get(item.signal) !== item.value) {
          return fail(REASON.CONTEXT_EVIDENCE_CONFLICT);
        }
        evidenceBySignal.set(item.signal, item.value);
      }

      if (!evidenceBySignal.has(SIGNAL.EXACT_ORIGIN) ||
          !evidenceBySignal.has(SIGNAL.TRUSTED_CONTEXT_KIND)) {
        return fail(REASON.CONTEXT_EVIDENCE_MISSING);
      }
      if (evidenceBySignal.get(SIGNAL.EXACT_ORIGIN) !== parsed.origin ||
          evidenceBySignal.get(SIGNAL.TRUSTED_CONTEXT_KIND) !== input.contextKind) {
        return fail(REASON.CONTEXT_EVIDENCE_CONFLICT);
      }

      const identity = input.semanticIdentity;
      let stableSignal;
      let stableValue;

      if (input.contextKind === CONTEXT_KIND.CONFIGURED_CORPUS ||
          input.contextKind === CONTEXT_KIND.VENDOR_FOLDER) {
        if (parsed.origin !== DRIVE_ORIGIN || identity.kind !== IDENTITY_KIND.DRIVE_FOLDER) {
          return fail(REASON.CONTEXT_EVIDENCE_CONFLICT);
        }
        stableSignal = SIGNAL.DRIVE_ITEM_ID;
        stableValue = identity.id;
      } else if (input.contextKind === CONTEXT_KIND.AGREEMENT_READING) {
        const match = parsed.pathname.match(/^\/document\/d\/([^/]+)(?:\/|$)/);
        if (parsed.origin !== DOCS_ORIGIN || identity.kind !== IDENTITY_KIND.DOCS_DOCUMENT ||
            !match || !match[1]) {
          return fail(REASON.CONTEXT_EVIDENCE_CONFLICT);
        }
        let documentId;
        try {
          documentId = decodeURIComponent(match[1]);
        } catch (_error) {
          return fail(REASON.ROUTE_MALFORMED);
        }
        if (documentId !== identity.id) return fail(REASON.CONTEXT_EVIDENCE_CONFLICT);
        stableSignal = SIGNAL.DOCS_DOCUMENT_ID;
        stableValue = identity.id;
      } else if (identity.kind === IDENTITY_KIND.DOCS_DOCUMENT) {
        const match = parsed.pathname.match(/^\/document\/d\/([^/]+)(?:\/|$)/);
        let documentId = '';
        try {
          documentId = match && match[1] ? decodeURIComponent(match[1]) : '';
        } catch (_error) {
          return fail(REASON.ROUTE_MALFORMED);
        }
        if (parsed.origin !== DOCS_ORIGIN || documentId !== identity.id) {
          return fail(REASON.CONTEXT_EVIDENCE_CONFLICT);
        }
        stableSignal = SIGNAL.DOCS_DOCUMENT_ID;
        stableValue = identity.id;
      } else if (identity.kind === IDENTITY_KIND.DRIVE_FILE) {
        if (parsed.origin !== DRIVE_ORIGIN) return fail(REASON.CONTEXT_EVIDENCE_CONFLICT);
        stableSignal = SIGNAL.DRIVE_ITEM_ID;
        stableValue = identity.id;
      } else if (identity.kind === IDENTITY_KIND.OPAQUE_TARGET) {
        stableSignal = SIGNAL.OPAQUE_TARGET_KEY;
        stableValue = identity.id;
      } else {
        return fail(REASON.CONTEXT_EVIDENCE_CONFLICT);
      }

      if (!evidenceBySignal.has(stableSignal)) return fail(REASON.CONTEXT_EVIDENCE_MISSING);
      if (evidenceBySignal.get(stableSignal) !== stableValue) {
        return fail(REASON.CONTEXT_EVIDENCE_CONFLICT);
      }

      const semanticIdentity = Object.freeze({ kind: identity.kind, id: identity.id });
      const evidence = Object.freeze(Array.from(evidenceBySignal, ([signal, value]) =>
        Object.freeze({ signal, value })
      ));
      return Object.freeze({
        status: STATUS.RECOGNIZED,
        contextKind: input.contextKind,
        contextEpoch: epoch,
        semanticIdentity,
        evidence
      });
    }

    return Object.freeze({
      route,
      currentEpoch() { return epoch; },
      dispose() {
        disposed = true;
        return true;
      }
    });
  }

  return Object.freeze({ STATUS, CONTEXT_KIND, IDENTITY_KIND, REASON, SIGNAL, createRouter });
}

function evidence(origin, contextKind, stableSignal, stableValue) {
  return [
    { signal: 'exact-origin', value: origin },
    { signal: 'trusted-context-kind', value: contextKind },
    { signal: stableSignal, value: stableValue }
  ];
}

function routeInput(overrides = {}) {
  return {
    url: DRIVE_ORIGIN + '/drive/folders/corpus-123',
    contextKind: 'configured-corpus',
    semanticIdentity: { kind: 'drive-folder', id: 'corpus-123' },
    evidence: evidence(DRIVE_ORIGIN, 'configured-corpus', 'drive-item-id', 'corpus-123'),
    ...overrides
  };
}

function assertExactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), expected.slice().sort(), label);
}

function assertClosedFailure(api, result, reason, label) {
  assert.equal(result.status, reason === api.REASON.CONTEXT_EVIDENCE_MISSING ||
    reason === api.REASON.CONTEXT_EVIDENCE_CONFLICT
    ? api.STATUS.UNCERTAIN
    : api.STATUS.UNSUPPORTED, `${label}: status`);
  assert.equal(result.reason, reason, `${label}: reason`);
  assert.equal(result.retryable, result.status === api.STATUS.UNCERTAIN, `${label}: retryable`);
  assert.ok(Number.isSafeInteger(result.contextEpoch) && result.contextEpoch > 0,
    `${label}: positive safe context epoch`);
  assertExactKeys(result, ['status', 'contextEpoch', 'reason', 'retryable'], `${label}: exact failure keys`);
  assert.ok(Object.isFrozen(result), `${label}: failure is frozen`);
}

function assertRecognized(api, result, expected, label) {
  assert.equal(result.status, api.STATUS.RECOGNIZED, `${label}: recognized`);
  assert.equal(result.contextKind, expected.contextKind, `${label}: context kind`);
  assert.deepEqual(result.semanticIdentity, expected.semanticIdentity, `${label}: stable identity`);
  assert.ok(Number.isSafeInteger(result.contextEpoch) && result.contextEpoch > 0,
    `${label}: positive safe context epoch`);
  assertExactKeys(result, [
    'status',
    'contextKind',
    'contextEpoch',
    'semanticIdentity',
    'evidence'
  ], `${label}: exact recognized keys`);
  assert.ok(Object.isFrozen(result), `${label}: result frozen`);
  assert.ok(Object.isFrozen(result.semanticIdentity), `${label}: identity frozen`);
  assert.ok(Object.isFrozen(result.evidence), `${label}: evidence array frozen`);
  assert.ok(result.evidence.every(Object.isFrozen), `${label}: evidence items frozen`);
}

function assertVocabulary(api) {
  assert.deepEqual(api.STATUS, {
    RECOGNIZED: 'recognized',
    UNCERTAIN: 'uncertain',
    UNSUPPORTED: 'unsupported'
  });
  assert.deepEqual(api.CONTEXT_KIND, {
    CONFIGURED_CORPUS: 'configured-corpus',
    VENDOR_FOLDER: 'vendor-folder',
    AGREEMENT_READING: 'agreement-reading',
    FOCUSED_ASK: 'focused-ask'
  });
  assert.deepEqual(api.IDENTITY_KIND, {
    DRIVE_FOLDER: 'drive-folder',
    DRIVE_FILE: 'drive-file',
    DOCS_DOCUMENT: 'docs-document',
    OPAQUE_TARGET: 'opaque-target'
  });
  assert.deepEqual(api.REASON, {
    CONTEXT_EVIDENCE_MISSING: 'context-evidence-missing',
    CONTEXT_EVIDENCE_CONFLICT: 'context-evidence-conflict',
    CONTEXT_KIND_UNSUPPORTED: 'context-kind-unsupported',
    ORIGIN_UNSUPPORTED: 'origin-unsupported',
    ROUTE_MALFORMED: 'route-malformed',
    ROUTER_DISPOSED: 'router-disposed'
  });
  assert.deepEqual(api.SIGNAL, {
    EXACT_ORIGIN: 'exact-origin',
    TRUSTED_CONTEXT_KIND: 'trusted-context-kind',
    DRIVE_ITEM_ID: 'drive-item-id',
    DOCS_DOCUMENT_ID: 'docs-document-id',
    OPAQUE_TARGET_KEY: 'opaque-target-key'
  });
  for (const vocabulary of [api, api.STATUS, api.CONTEXT_KIND, api.IDENTITY_KIND, api.REASON, api.SIGNAL]) {
    assert.ok(Object.isFrozen(vocabulary), 'public vocabularies are frozen');
  }
  assert.equal(typeof api.createRouter, 'function');
}

function testRecognizedContexts(api) {
  const cases = [
    {
      label: 'configured corpus',
      input: routeInput()
    },
    {
      label: 'vendor folder',
      input: routeInput({
        url: DRIVE_ORIGIN + '/drive/u/0/folders/vendor-456',
        contextKind: 'vendor-folder',
        semanticIdentity: { kind: 'drive-folder', id: 'vendor-456' },
        evidence: evidence(DRIVE_ORIGIN, 'vendor-folder', 'drive-item-id', 'vendor-456')
      })
    },
    {
      label: 'agreement reading',
      input: routeInput({
        url: DOCS_ORIGIN + '/document/d/doc-123/edit?tab=t.0',
        contextKind: 'agreement-reading',
        semanticIdentity: { kind: 'docs-document', id: 'doc-123' },
        evidence: evidence(DOCS_ORIGIN, 'agreement-reading', 'docs-document-id', 'doc-123')
      })
    },
    {
      label: 'focused ask',
      input: routeInput({
        url: DRIVE_ORIGIN + '/drive/u/0/my-drive',
        contextKind: 'focused-ask',
        semanticIdentity: { kind: 'opaque-target', id: 'ask:target-789' },
        evidence: evidence(DRIVE_ORIGIN, 'focused-ask', 'opaque-target-key', 'ask:target-789')
      })
    }
  ];

  const router = api.createRouter({ generation: 7 });
  let previousEpoch = 0;
  for (const testCase of cases) {
    const result = router.route(testCase.input);
    assertRecognized(api, result, testCase.input, testCase.label);
    assert.ok(result.contextEpoch > previousEpoch, `${testCase.label}: epoch increases`);
    previousEpoch = result.contextEpoch;
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(testCase.input.url), false, `${testCase.label}: raw URL is not emitted`);
  }
  assert.equal(router.currentEpoch(), previousEpoch, 'currentEpoch reports the latest admission');
}

function testEvidenceAndIdentityFailures(api) {
  const base = routeInput();
  const missingSignals = ['exact-origin', 'trusted-context-kind', 'drive-item-id'];
  for (const signal of missingSignals) {
    const router = api.createRouter({ generation: 1 });
    const result = router.route(routeInput({
      evidence: base.evidence.filter(item => item.signal !== signal)
    }));
    assertClosedFailure(api, result, api.REASON.CONTEXT_EVIDENCE_MISSING, `missing ${signal}`);
  }

  const conflicts = [
    ['exact origin conflict', routeInput({
      evidence: evidence(DOCS_ORIGIN, 'configured-corpus', 'drive-item-id', 'corpus-123')
    })],
    ['context kind conflict', routeInput({
      evidence: evidence(DRIVE_ORIGIN, 'vendor-folder', 'drive-item-id', 'corpus-123')
    })],
    ['drive identity conflict', routeInput({
      evidence: evidence(DRIVE_ORIGIN, 'configured-corpus', 'drive-item-id', 'other-id')
    })],
    ['visible name cannot identify', routeInput({
      semanticIdentity: null,
      evidence: [
        { signal: 'exact-origin', value: DRIVE_ORIGIN },
        { signal: 'trusted-context-kind', value: 'configured-corpus' }
      ]
    })],
    ['docs route and identity mismatch', routeInput({
      url: DOCS_ORIGIN + '/document/d/doc-123/edit',
      contextKind: 'agreement-reading',
      semanticIdentity: { kind: 'docs-document', id: 'doc-999' },
      evidence: evidence(DOCS_ORIGIN, 'agreement-reading', 'docs-document-id', 'doc-999')
    })]
  ];
  for (const [label, input] of conflicts) {
    const result = api.createRouter({ generation: 2 }).route(input);
    const expected = label === 'visible name cannot identify'
      ? api.REASON.CONTEXT_EVIDENCE_MISSING
      : api.REASON.CONTEXT_EVIDENCE_CONFLICT;
    assertClosedFailure(api, result, expected, label);
  }

  const brittleHints = [
    ['visibleName', 'Acme Vendor'],
    ['listIndex', 4],
    ['cssClass', 'drive-row selected'],
    ['domShape', { role: 'row', children: 3 }],
    ['queryText', 'What is the renewal date?'],
    ['pageLabel', 'Configured corpus']
  ];
  for (const [key, value] of brittleHints) {
    const input = routeInput({ semanticIdentity: null });
    input[key] = value;
    const result = api.createRouter({ generation: 3 }).route(input);
    assertClosedFailure(api, result, api.REASON.ROUTE_MALFORMED, `${key} cannot add authority`);
  }

  const urlOnly = routeInput({ semanticIdentity: null, evidence: [] });
  assert.notEqual(
    api.createRouter({ generation: 4 }).route(urlOnly).status,
    api.STATUS.RECOGNIZED,
    'URL evidence alone never recognizes configured corpus'
  );
}

function testUnsupportedAndMalformedRoutes(api) {
  const unsupportedOrigins = [
    'https://docs.google.com.evil.example/document/d/doc-123/edit',
    'https://drive.google.com.evil.example/drive/folders/corpus-123',
    'http://drive.google.com/drive/folders/corpus-123',
    'http://docs.google.com/document/d/doc-123/edit',
    'data:text/html,drive.google.com',
    'javascript:drive.google.com'
  ];
  for (const url of unsupportedOrigins) {
    const result = api.createRouter({ generation: 5 }).route(routeInput({ url }));
    assertClosedFailure(api, result, api.REASON.ORIGIN_UNSUPPORTED, `unsupported origin ${url}`);
  }

  for (const url of ['', 'not a URL', 'https://[::1']) {
    const result = api.createRouter({ generation: 6 }).route(routeInput({ url }));
    assertClosedFailure(api, result, api.REASON.ROUTE_MALFORMED, `malformed URL ${url}`);
  }

  const unknownKind = api.createRouter({ generation: 6 }).route(routeInput({
    contextKind: 'future-contract-dashboard',
    evidence: evidence(DRIVE_ORIGIN, 'future-contract-dashboard', 'drive-item-id', 'corpus-123')
  }));
  assertClosedFailure(api, unknownKind, api.REASON.CONTEXT_KIND_UNSUPPORTED, 'unknown context kind');
}

function testClosedSchemasAndHostileValues(api) {
  const hostileValues = [
    '<script>alert(1)</script>',
    'onerror=alert(1)',
    '"][data-owned]',
    '\u202Eevil\u200B'
  ];

  const cases = [];
  for (const value of hostileValues) {
    cases.push([
      `hostile identity ${JSON.stringify(value)}`,
      routeInput({
        semanticIdentity: { kind: 'drive-folder', id: value },
        evidence: evidence(DRIVE_ORIGIN, 'configured-corpus', 'drive-item-id', value)
      })
    ]);
  }
  cases.push([
    'oversized URL',
    routeInput({ url: DRIVE_ORIGIN + '/' + 'a'.repeat(MAX_URL_LENGTH) })
  ]);
  cases.push([
    'oversized identity',
    routeInput({
      semanticIdentity: { kind: 'drive-folder', id: 'a'.repeat(MAX_VALUE_LENGTH + 1) },
      evidence: evidence(
        DRIVE_ORIGIN,
        'configured-corpus',
        'drive-item-id',
        'a'.repeat(MAX_VALUE_LENGTH + 1)
      )
    })
  ]);
  cases.push(['unknown input key', { ...routeInput(), label: '<script>page label</script>' }]);
  const symbolKeyInput = routeInput();
  symbolKeyInput[Symbol('page-label')] = 'Corpus';
  cases.push(['unknown symbol key', symbolKeyInput]);
  cases.push(['unknown identity key', routeInput({
    semanticIdentity: { kind: 'drive-folder', id: 'corpus-123', label: 'Corpus' }
  })]);
  cases.push(['unknown identity vocabulary', routeInput({
    semanticIdentity: { kind: 'drive-row', id: 'corpus-123' }
  })]);
  cases.push(['unknown signal vocabulary', routeInput({
    evidence: [...routeInput().evidence, { signal: 'visible-label', value: 'Corpus' }]
  })]);
  cases.push(['unknown evidence key', routeInput({
    evidence: [{ signal: 'exact-origin', value: DRIVE_ORIGIN, reason: 'trusted' }]
  })]);
  cases.push(['unknown reason vocabulary', { ...routeInput(), reason: 'page-said-so' }]);
  cases.push(['too many evidence items', routeInput({
    evidence: Array.from({ length: MAX_EVIDENCE + 1 }, () => ({
      signal: 'exact-origin',
      value: DRIVE_ORIGIN
    }))
  })]);

  for (const [label, input] of cases) {
    const result = api.createRouter({ generation: 8 }).route(input);
    assertClosedFailure(api, result, api.REASON.ROUTE_MALFORMED, label);
    const serialized = JSON.stringify(result);
    for (const hostile of hostileValues) {
      assert.equal(serialized.includes(hostile), false, `${label}: hostile value is not echoed`);
    }
  }
}

function testGenerationEpochAndDispose(api) {
  for (const generation of [undefined, null, 0, -1, 1.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => api.createRouter({ generation }),
      TypeError,
      `generation ${String(generation)} is rejected`
    );
  }
  assert.throws(() => api.createRouter({ generation: 1, extra: true }), TypeError,
    'unknown createRouter options fail closed');

  const router = api.createRouter({ generation: Number.MAX_SAFE_INTEGER });
  const first = router.route(routeInput());
  const second = router.route(routeInput({
    url: 'https://docs.google.com.evil.example/document/d/doc-123/edit'
  }));
  assert.ok(second.contextEpoch > first.contextEpoch, 'unsupported admissions also advance epoch');
  assert.equal(router.dispose(), true, 'first dispose succeeds');
  assert.equal(router.dispose(), true, 'dispose is idempotent');
  const disposed = router.route(routeInput());
  assertClosedFailure(api, disposed, api.REASON.ROUTER_DISPOSED, 'post-dispose route');
  assert.ok(disposed.contextEpoch > second.contextEpoch, 'post-dispose admission cannot reuse an epoch');
  assert.equal(router.currentEpoch(), disposed.contextEpoch);
  assert.ok(Object.isFrozen(router), 'router surface is frozen');
}

function testExactOriginSabotageControl(api) {
  const nearNeighbor = 'https://drive.google.com.evil.example/drive/u/0/my-drive';
  const parsed = new URL(nearNeighbor);
  const exactOriginAdmission = value => value.origin === DRIVE_ORIGIN || value.origin === DOCS_ORIGIN;
  const weakenedSubstringAdmission = value => value.hostname.includes('google.com');

  assert.equal(exactOriginAdmission(parsed), false, 'exact-origin oracle rejects the near-neighbor host');
  assert.throws(
    () => assert.equal(weakenedSubstringAdmission(parsed), false, 'weakened exact-origin equality must reject the spoof'),
    /weakened exact-origin equality/,
    'negative control proves the origin assertion detects substring admission'
  );

  const result = api.createRouter({ generation: 53 }).route(routeInput({ url: nearNeighbor }));
  assertClosedFailure(api, result, api.REASON.ORIGIN_UNSUPPORTED,
    'production/oracle exact-origin boundary after sabotage control');
}

function runContract(api) {
  assertVocabulary(api);
  testRecognizedContexts(api);
  testEvidenceAndIdentityFailures(api);
  testUnsupportedAndMalformedRoutes(api);
  testClosedSchemasAndHostileValues(api);
  testGenerationEpochAndDispose(api);
  testExactOriginSabotageControl(api);
}

function loadProduction() {
  assert.ok(
    fs.existsSync(ROUTER_PATH),
    'production context router is missing: extension/content/skopeo-context-router.js'
  );
  delete globalThis.FSBSkopeoContextRouter;
  const api = require(ROUTER_PATH);
  assert.strictEqual(globalThis.FSBSkopeoContextRouter, api,
    'classic-script global matches the CommonJS production export');
  return api;
}

const api = SELF_TEST ? createContractOracle() : loadProduction();
runContract(api);
console.log(`skopeo context router ${SELF_TEST ? 'oracle' : 'production'} contract: PASS`);
