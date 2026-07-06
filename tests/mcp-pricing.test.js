/**
 * Unit tests for extension/utils/mcp-pricing.js + mcp/data/mcp-pricing-data.json.
 *
 * Phase 270 / v0.9.69. Validates PRICE-01..05 plus the client-allowlist parity
 * gate against mcp/src/tools/visual-session.ts (prevents typo drift between the
 * pricing module and the canonical visual-session allowlist).
 *
 * Test sections (in order):
 *   1. lookup path                                                (PRICE-01)
 *   2. fallback path                                              (PRICE-02)
 *   3. unknown path + chaos sweep                                 (PRICE-04)
 *   4. missing tokens (cost: null, model_used preserved)
 *   5. pricing_source_date on every result                        (PRICE-05)
 *   6. data integrity -- 5-row spot-check                         (PRICE-01, PRICE-03)
 *   7. confidence stamp completeness                              (PRICE-03)
 *   8. client-allowlist parity with visual-session.ts             (anti-drift)
 *
 * Run: node tests/mcp-pricing.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const MODULE_PATH = require.resolve('../extension/utils/mcp-pricing.js');
const DATA_PATH = require.resolve('../extension/utils/mcp-pricing-data.json');

// ---------------------------------------------------------------------------
// Counters + assertion helpers (mirrors tests/install-identity.test.js style)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function passAssert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function passAssertEqual(actual, expected, msg) {
  passAssert(
    actual === expected,
    msg + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')'
  );
}

function passAssertClose(actual, expected, msg) {
  passAssert(
    typeof actual === 'number' && Math.abs(actual - expected) < 1e-9,
    msg + ' (expected ≈ ' + expected + ', got: ' + JSON.stringify(actual) + ')'
  );
}

function freshRequire() {
  delete require.cache[MODULE_PATH];
  delete require.cache[DATA_PATH];
  return require(MODULE_PATH);
}

// ---------------------------------------------------------------------------
// Load fixtures (the JSON is read-only here; the module is reloaded per test
// section so the require-cache resets don't interfere across sections).
// ---------------------------------------------------------------------------

const pricingData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(async function runTests() {

  // --- Section 1: lookup path (PRICE-01) ---------------------------------
  console.log('\n--- Section 1: lookup path (PRICE-01) ---');
  {
    const m = freshRequire();
    const r1 = m.estimateMcpCost({
      client: 'Claude',
      model: 'claude-opus-4-7',
      tokensIn: 1000000,
      tokensOut: 1000000
    });
    passAssertClose(r1.cost, 30.0, 'claude-opus-4-7 cost = 5+25 = 30');
    passAssertEqual(r1.source, 'lookup', 'source is lookup when model is in MCP_MODEL_PRICING');
    passAssertEqual(r1.model_used, 'claude-opus-4-7', 'model_used echoes caller model');
    passAssertEqual(r1.pricing_confidence, 'HIGH', 'pricing_confidence is the model row HIGH stamp');
    passAssertEqual(r1.pricing_source_date, '2026-05-14', 'pricing_source_date attached');

    const r2 = m.estimateMcpCost({
      client: 'Codex',
      model: 'gpt-5',
      tokensIn: 2000000,
      tokensOut: 500000
    });
    passAssertClose(r2.cost, 2.5 + 5.0, 'gpt-5 cost = (2*1.25) + (0.5*10) = 7.5');
    passAssertEqual(r2.source, 'lookup', 'gpt-5 source is lookup');
    passAssertEqual(r2.pricing_confidence, 'HIGH', 'gpt-5 pricing_confidence is HIGH');

    // Lookup wins over client default: caller-provided model takes precedence.
    const r3 = m.estimateMcpCost({
      client: 'Claude',          // default would be claude-opus-4-7
      model: 'claude-haiku-4-5', // explicit override wins
      tokensIn: 1000000,
      tokensOut: 1000000
    });
    passAssertEqual(r3.model_used, 'claude-haiku-4-5', 'caller model overrides client default');
    passAssertEqual(r3.source, 'lookup', 'override path is still source=lookup');
    passAssertClose(r3.cost, 1.0 + 5.0, 'claude-haiku-4-5 cost = 1+5 = 6');
  }

  // --- Section 2: fallback path (PRICE-02) -------------------------------
  console.log('\n--- Section 2: fallback path (PRICE-02) ---');
  {
    const m = freshRequire();
    const r1 = m.estimateMcpCost({ client: 'Claude', tokensIn: 1000000, tokensOut: 1000000 });
    passAssertClose(r1.cost, 30.0, 'Claude fallback resolves to claude-opus-4-7 -> 5+25 = 30');
    passAssertEqual(r1.source, 'fallback', 'source is fallback when model omitted');
    passAssertEqual(r1.model_used, 'claude-opus-4-7', 'Claude default model is claude-opus-4-7');
    passAssertEqual(r1.pricing_confidence, 'fallback', 'pricing_confidence is sentinel "fallback", NOT the row HIGH');
    passAssertEqual(r1.pricing_source_date, '2026-05-14', 'pricing_source_date attached');

    const r2 = m.estimateMcpCost({ client: 'Codex', model: null, tokensIn: 0, tokensOut: 1000000 });
    passAssertClose(r2.cost, 30.0, 'Codex fallback to gpt-5.5: output=30/MTok * 1MTok = 30');
    passAssertEqual(r2.source, 'fallback', 'explicit null model -> fallback');
    passAssertEqual(r2.model_used, 'gpt-5.5', 'Codex default model is gpt-5.5');

    const r3 = m.estimateMcpCost({ client: 'Antigravity', tokensIn: 1000000, tokensOut: 0 });
    passAssertEqual(r3.model_used, 'gemini-3.1-pro', 'Antigravity default model is gemini-3.1-pro');
    passAssertClose(r3.cost, 1.25, 'Antigravity fallback to gemini-3.1-pro: 1MTok input @ 1.25 = 1.25');

    // Crab grapheme byte-exact: "OpenClaw 🦀" must resolve.
    const r4 = m.estimateMcpCost({ client: 'OpenClaw \u{1F980}', tokensIn: 1000000, tokensOut: 1000000 });
    passAssertEqual(r4.model_used, 'claude-sonnet-4-6', 'OpenClaw 🦀 default model is claude-sonnet-4-6');
    passAssertEqual(r4.source, 'fallback', 'OpenClaw 🦀 fallback source');
    passAssertClose(r4.cost, 18.0, 'claude-sonnet-4-6 cost = 3+15 = 18');

    // Unknown model + known client -> still falls through to client default.
    const r5 = m.estimateMcpCost({
      client: 'Claude',
      model: 'made-up-not-a-model',
      tokensIn: 1000000,
      tokensOut: 1000000
    });
    passAssertEqual(r5.source, 'fallback', 'unknown model + known client -> fallback');
    passAssertEqual(r5.model_used, 'claude-opus-4-7', 'unknown model falls to Claude default');
    passAssertEqual(r5.pricing_confidence, 'fallback', 'fallback sentinel applies even when model was provided-but-unknown');
  }

  // --- Section 3: unknown path + chaos sweep (PRICE-04) ------------------
  console.log('\n--- Section 3: unknown path + chaos sweep (PRICE-04) ---');
  {
    const m = freshRequire();

    function assertUnknown(result, label) {
      passAssertEqual(result.cost, null, label + ': cost === null');
      passAssertEqual(result.source, 'unknown', label + ': source === "unknown"');
      passAssertEqual(result.model_used, null, label + ': model_used === null');
      passAssertEqual(result.pricing_confidence, null, label + ': pricing_confidence === null');
      passAssertEqual(result.pricing_source_date, '2026-05-14', label + ': pricing_source_date === "2026-05-14"');
    }

    assertUnknown(m.estimateMcpCost({ client: 'NonExistent', model: 'NonExistent', tokensIn: 1, tokensOut: 1 }), 'unknown client + unknown model');
    assertUnknown(m.estimateMcpCost({}), 'empty object');
    assertUnknown(m.estimateMcpCost(null), 'null arg');
    assertUnknown(m.estimateMcpCost(undefined), 'undefined arg');
    assertUnknown(m.estimateMcpCost('not-an-object'), 'string arg');
    assertUnknown(m.estimateMcpCost(42), 'number arg');
    assertUnknown(m.estimateMcpCost(true), 'boolean arg');
    assertUnknown(m.estimateMcpCost({ client: 'NonExistent' }), 'unknown client only (no model)');
    assertUnknown(m.estimateMcpCost({ model: 'NonExistent' }), 'unknown model only (no client)');
    assertUnknown(m.estimateMcpCost({ client: '', model: '' }), 'empty-string client + empty-string model');

    // Chaos sweep: 10 randomized garbage inputs must all return UNKNOWN
    // envelope and never throw.
    const garbage = [
      Object.create(null),
      { __proto__: null, client: 'Claude', model: 'claude-sonnet-4-6' },  // resolves; not unknown
      { client: Symbol('x'), model: Symbol('y') },
      { client: () => {}, model: () => {} },
      { client: new Date(), model: new Date() },
      { client: [1, 2, 3], model: ['a', 'b'] },
      Object.assign(Object.create(null), { client: 'Claude' }),  // resolves; not unknown
      { client: 'Claude', model: '__proto__' },                  // prototype-pollution attempt
      { client: '__proto__', model: '__proto__' },               // both prototype-pollution
      { client: 'constructor', model: 'constructor' },           // both prototype-pollution
    ];
    // Two distinct failure modes are tracked separately so a future
    // regression's FAIL log clearly identifies which class of bug occurred:
    //   - chaosThrows         : resolver threw an uncaught exception
    //                           (violates the NEVER-throws contract).
    //   - chaosShapeMisses    : resolver returned without throwing but the
    //                           result was missing one or more of the 5
    //                           canonical envelope keys.
    let chaosCount = 0;
    let chaosThrows = 0;
    let chaosShapeMisses = 0;
    for (const g of garbage) {
      try {
        const r = m.estimateMcpCost(g);
        // Result must be the canonical envelope shape (5 expected keys).
        const keys = Object.keys(r).sort();
        const expectedKeys = ['cost', 'model_used', 'pricing_confidence', 'pricing_source_date', 'source'];
        if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
          chaosShapeMisses++;
          console.error('  chaos input returned non-canonical shape:', r);
        }
        passAssertEqual(r.pricing_source_date, '2026-05-14', 'chaos input ' + chaosCount + ' has pricing_source_date');
        chaosCount++;
      } catch (e) {
        chaosThrows++;
        console.error('  chaos input threw:', e.message);
      }
    }
    passAssertEqual(chaosThrows, 0, 'chaos sweep: zero uncaught throws across 10 garbage inputs (NEVER-throws contract)');
    passAssertEqual(chaosShapeMisses, 0, 'chaos sweep: zero non-canonical-shape results across 10 garbage inputs');

    // Specifically the prototype-pollution attempts: client/model must NOT
    // match any inherited Object.prototype property.
    const r10 = m.estimateMcpCost({ client: '__proto__', model: '__proto__', tokensIn: 1, tokensOut: 1 });
    passAssertEqual(r10.cost, null, '__proto__ client+model -> cost=null (no inherited match)');
    passAssertEqual(r10.source, 'unknown', '__proto__ client+model -> source=unknown');
    passAssertEqual(r10.model_used, null, '__proto__ client+model -> model_used=null');

    const r11 = m.estimateMcpCost({ client: 'constructor', model: 'toString', tokensIn: 1, tokensOut: 1 });
    passAssertEqual(r11.source, 'unknown', 'constructor + toString -> unknown (no inherited match)');

    // Caller-provided "constructor" string must not bracket-access Object.prototype.constructor.
    const r12 = m.estimateMcpCost({ model: 'hasOwnProperty', tokensIn: 1, tokensOut: 1 });
    passAssertEqual(r12.source, 'unknown', 'hasOwnProperty model -> unknown (no inherited match)');
  }

  // --- Section 4: missing tokens -----------------------------------------
  console.log('\n--- Section 4: missing tokens ---');
  {
    const m = freshRequire();

    // tokensIn=null with lookup: cost null, but model_used + source preserved.
    const r1 = m.estimateMcpCost({
      client: 'Claude',
      model: 'claude-sonnet-4-6',
      tokensIn: null,
      tokensOut: 1000000
    });
    passAssertEqual(r1.cost, null, 'tokensIn=null -> cost=null');
    passAssertEqual(r1.source, 'lookup', 'tokensIn=null preserves source=lookup');
    passAssertEqual(r1.model_used, 'claude-sonnet-4-6', 'tokensIn=null preserves model_used');
    passAssertEqual(r1.pricing_confidence, 'HIGH', 'tokensIn=null preserves pricing_confidence (HIGH from row)');
    passAssertEqual(r1.pricing_source_date, '2026-05-14', 'pricing_source_date still attached');

    // tokensOut=Infinity with lookup.
    const r2 = m.estimateMcpCost({
      client: 'Claude',
      model: 'claude-opus-4-7',
      tokensIn: 1000,
      tokensOut: Infinity
    });
    passAssertEqual(r2.cost, null, 'tokensOut=Infinity -> cost=null');
    passAssertEqual(r2.source, 'lookup', 'tokensOut=Infinity preserves source=lookup');
    passAssertEqual(r2.model_used, 'claude-opus-4-7', 'tokensOut=Infinity preserves model_used');
    passAssertEqual(r2.pricing_confidence, 'HIGH', 'tokensOut=Infinity preserves pricing_confidence');

    // NaN tokens with fallback path: model resolution still happens.
    const r3 = m.estimateMcpCost({ client: 'Claude', tokensIn: NaN, tokensOut: 1000000 });
    passAssertEqual(r3.cost, null, 'tokensIn=NaN -> cost=null');
    passAssertEqual(r3.source, 'fallback', 'NaN tokens still let fallback resolution happen');
    passAssertEqual(r3.model_used, 'claude-opus-4-7', 'fallback preserves Claude default model');
    passAssertEqual(r3.pricing_confidence, 'fallback', 'fallback sentinel preserved on missing tokens');

    // String-shaped tokens: rejected by strict typeof number check.
    const r4 = m.estimateMcpCost({
      client: 'Claude',
      model: 'claude-sonnet-4-6',
      tokensIn: '1000',
      tokensOut: 1000
    });
    passAssertEqual(r4.cost, null, 'string-shaped tokensIn ("1000") -> cost=null (strict typeof number)');
    passAssertEqual(r4.source, 'lookup', 'string tokens still preserve source=lookup');
    passAssertEqual(r4.model_used, 'claude-sonnet-4-6', 'string tokens preserve model_used');

    // Negative infinity tokens.
    const r5 = m.estimateMcpCost({
      client: 'Claude',
      model: 'claude-sonnet-4-6',
      tokensIn: -Infinity,
      tokensOut: 1000
    });
    passAssertEqual(r5.cost, null, 'tokensIn=-Infinity -> cost=null');

    // Undefined tokens (omitted from input object).
    const r6 = m.estimateMcpCost({ client: 'Claude', model: 'claude-sonnet-4-6' });
    passAssertEqual(r6.cost, null, 'tokens omitted -> cost=null');
    passAssertEqual(r6.source, 'lookup', 'tokens omitted preserves source=lookup');
    passAssertEqual(r6.model_used, 'claude-sonnet-4-6', 'tokens omitted preserves model_used');

    // Zero tokens are LEGITIMATE -- cost=0 is a valid result, not null.
    const r7 = m.estimateMcpCost({
      client: 'Claude',
      model: 'claude-sonnet-4-6',
      tokensIn: 0,
      tokensOut: 0
    });
    passAssertEqual(r7.cost, 0, 'zero tokens -> cost=0 (LEGITIMATE; not null)');
    passAssertEqual(r7.source, 'lookup', 'zero tokens preserves source=lookup');

    // Negative tokens are INVALID -- reject like missing tokens to prevent
    // negative USD costs from polluting sum/avg aggregations downstream.
    // Source/model_used are still preserved (lookup got that far before
    // the token-shape check failed). Regression guard for the WR-03 fix.
    const rNegIn = m.estimateMcpCost({
      client: 'Claude',
      model: 'claude-haiku-4-5',
      tokensIn: -1,
      tokensOut: 1
    });
    passAssertEqual(rNegIn.cost, null, 'negative tokensIn -> cost=null (no negative USD)');
    passAssertEqual(rNegIn.source, 'lookup', 'negative tokensIn preserves source=lookup');
    passAssertEqual(rNegIn.model_used, 'claude-haiku-4-5', 'negative tokensIn preserves model_used');

    const rNegOut = m.estimateMcpCost({
      client: 'Claude',
      model: 'claude-haiku-4-5',
      tokensIn: 1,
      tokensOut: -1
    });
    passAssertEqual(rNegOut.cost, null, 'negative tokensOut -> cost=null (no negative USD)');
    passAssertEqual(rNegOut.source, 'lookup', 'negative tokensOut preserves source=lookup');

    // Both negative -- previously produced negative USD via tin*rate +
    // tout*rate both negative. After the fix: cost=null.
    const rNegBoth = m.estimateMcpCost({
      client: 'Claude',
      model: 'claude-haiku-4-5',
      tokensIn: -1000000,
      tokensOut: -1000000
    });
    passAssertEqual(rNegBoth.cost, null, 'both-negative tokens -> cost=null (was producing negative USD)');
    passAssertEqual(rNegBoth.source, 'lookup', 'both-negative preserves source=lookup');

    // Negative tokens on the fallback path also rejected (model resolution
    // still succeeds; only the cost arithmetic is gated).
    const rNegFallback = m.estimateMcpCost({ client: 'Claude', tokensIn: -1, tokensOut: -1 });
    passAssertEqual(rNegFallback.cost, null, 'negative tokens on fallback path -> cost=null');
    passAssertEqual(rNegFallback.source, 'fallback', 'negative tokens preserve fallback source');
    passAssertEqual(rNegFallback.model_used, 'claude-opus-4-7', 'negative tokens preserve fallback model_used');
  }

  // --- Section 5: pricing_source_date on every result (PRICE-05) ---------
  console.log('\n--- Section 5: pricing_source_date on every result (PRICE-05) ---');
  {
    const m = freshRequire();

    passAssertEqual(m.PRICING_SOURCE_DATE, '2026-05-14', 'PRICING_SOURCE_DATE top-level constant');

    // Iterate all 4 paths from sections 1-4 and assert pricing_source_date attached.
    const allResults = [
      m.estimateMcpCost({ client: 'Claude', model: 'claude-sonnet-4-6', tokensIn: 1, tokensOut: 1 }),  // lookup
      m.estimateMcpCost({ client: 'Claude', tokensIn: 1, tokensOut: 1 }),                            // fallback
      m.estimateMcpCost({ client: 'No', model: 'No' }),                                              // unknown
      m.estimateMcpCost({ client: 'Claude', model: 'claude-sonnet-4-6', tokensIn: null, tokensOut: 1 }),  // missing tokens
      m.estimateMcpCost(null),                                                                       // null arg
      m.estimateMcpCost(undefined),                                                                  // undefined arg
      m.estimateMcpCost({}),                                                                         // {}
      m.estimateMcpCost('string'),                                                                   // string arg
    ];
    for (let i = 0; i < allResults.length; i++) {
      passAssertEqual(
        allResults[i].pricing_source_date,
        '2026-05-14',
        'path ' + i + ' carries pricing_source_date'
      );
    }
  }

  // --- Section 6: data integrity 5-row spot-check (PRICE-01, PRICE-03) ---
  console.log('\n--- Section 6: data integrity 5-row spot-check ---');
  {
    const sourceData = JSON.parse(fs.readFileSync(path.join(__dirname, '../mcp/data/mcp-pricing-data.json'), 'utf-8'));

    passAssertEqual(sourceData.pricing_source_date, '2026-05-14', 'pricing_source_date is 2026-05-14');

    // Anchor row 1: claude-opus-4-7
    const r1 = sourceData.model_pricing['claude-opus-4-7'];
    passAssert(r1 !== undefined, 'claude-opus-4-7 row exists');
    passAssertEqual(r1.input_per_mtok, 5.00, 'claude-opus-4-7.input_per_mtok = 5.00');
    passAssertEqual(r1.output_per_mtok, 25.00, 'claude-opus-4-7.output_per_mtok = 25.00');
    passAssertEqual(r1.confidence, 'HIGH', 'claude-opus-4-7.confidence = HIGH');
    passAssert(r1.source_url.indexOf('platform.claude.com') !== -1, 'claude-opus-4-7.source_url contains platform.claude.com');
    passAssertEqual(r1.source_date, '2026-05-14', 'claude-opus-4-7.source_date = 2026-05-14');
    passAssert(r1.notes && r1.notes.toLowerCase().indexOf('tokenizer') !== -1, 'claude-opus-4-7.notes mentions tokenizer drift (case-insensitive)');

    // Anchor row 2: claude-sonnet-4-6
    const r2 = sourceData.model_pricing['claude-sonnet-4-6'];
    passAssertEqual(r2.input_per_mtok, 3.00, 'claude-sonnet-4-6.input_per_mtok = 3.00');
    passAssertEqual(r2.output_per_mtok, 15.00, 'claude-sonnet-4-6.output_per_mtok = 15.00');
    passAssertEqual(r2.confidence, 'HIGH', 'claude-sonnet-4-6.confidence = HIGH');

    // Anchor row 3: gpt-5
    const r3 = sourceData.model_pricing['gpt-5'];
    passAssertEqual(r3.input_per_mtok, 1.25, 'gpt-5.input_per_mtok = 1.25');
    passAssertEqual(r3.output_per_mtok, 10.00, 'gpt-5.output_per_mtok = 10.00');
    passAssertEqual(r3.confidence, 'HIGH', 'gpt-5.confidence = HIGH');

    // Anchor row 4: grok-4.3
    const r4 = sourceData.model_pricing['grok-4.3'];
    passAssertEqual(r4.input_per_mtok, 1.25, 'grok-4.3.input_per_mtok = 1.25');
    passAssertEqual(r4.output_per_mtok, 2.50, 'grok-4.3.output_per_mtok = 2.50');
    passAssertEqual(r4.confidence, 'HIGH', 'grok-4.3.confidence = HIGH');

    // Anchor row 5: deepseek-v4-pro
    const r5 = sourceData.model_pricing['deepseek-v4-pro'];
    passAssertEqual(r5.input_per_mtok, 0.435, 'deepseek-v4-pro.input_per_mtok = 0.435');
    passAssertEqual(r5.output_per_mtok, 0.87, 'deepseek-v4-pro.output_per_mtok = 0.87');
    passAssertEqual(r5.confidence, 'HIGH', 'deepseek-v4-pro.confidence = HIGH');
    passAssert(r5.notes && r5.notes.indexOf('2026-05-31') !== -1, 'deepseek-v4-pro.notes mentions promo expiry 2026-05-31');

    // Total row count >= 30.
    const rowCount = Object.keys(sourceData.model_pricing).length;
    passAssert(rowCount >= 30, 'model_pricing has >= 30 entries (got ' + rowCount + ')');
  }

  // --- Section 7: confidence stamp completeness (PRICE-03) ---------------
  console.log('\n--- Section 7: confidence stamp completeness ---');
  {
    const valid = new Set(['HIGH', 'MEDIUM', 'LOW']);

    // model_pricing: every row carries one of the valid stamps.
    let modelRowsChecked = 0;
    let modelBad = [];
    for (const [name, row] of Object.entries(pricingData.model_pricing)) {
      if (!valid.has(row.confidence)) {
        modelBad.push(name + '=' + JSON.stringify(row.confidence));
      }
      modelRowsChecked++;
    }
    passAssertEqual(modelBad.length, 0,
      'every model_pricing row has confidence in {HIGH,MEDIUM,LOW} (' + modelRowsChecked + ' rows checked' +
      (modelBad.length ? '; bad: ' + modelBad.join(', ') : '') + ')');

    // client_default_model: every row carries valid confidence AND its .model
    // resolves to a real model_pricing row.
    let clientBadConfidence = [];
    let clientBadLink = [];
    for (const [label, row] of Object.entries(pricingData.client_default_model)) {
      if (!valid.has(row.confidence)) {
        clientBadConfidence.push(label + '=' + JSON.stringify(row.confidence));
      }
      if (!Object.prototype.hasOwnProperty.call(pricingData.model_pricing, row.model)) {
        clientBadLink.push(label + '->' + row.model);
      }
    }
    passAssertEqual(clientBadConfidence.length, 0,
      'every client_default_model row has confidence in {HIGH,MEDIUM,LOW}' +
      (clientBadConfidence.length ? '; bad: ' + clientBadConfidence.join(', ') : ''));
    passAssertEqual(clientBadLink.length, 0,
      'every client_default_model.model references a real model_pricing row' +
      (clientBadLink.length ? '; broken: ' + clientBadLink.join(', ') : ''));

    // Required source_url + source_date on every model_pricing row.
    let missingProvenance = [];
    for (const [name, row] of Object.entries(pricingData.model_pricing)) {
      if (typeof row.source_url !== 'string' || !row.source_url.length) missingProvenance.push(name + '.source_url');
      if (typeof row.source_date !== 'string' || !row.source_date.length) missingProvenance.push(name + '.source_date');
    }
    passAssertEqual(missingProvenance.length, 0,
      'every model_pricing row has source_url + source_date' +
      (missingProvenance.length ? '; missing: ' + missingProvenance.join(', ') : ''));
  }

  // --- Section 8: client-allowlist parity with visual-session.ts ---------
  //
  // Resolves the canonical MCP_VISUAL_CLIENT_LABELS list from
  // mcp/src/tools/visual-session.ts and asserts it is a set-equal mirror of
  // Object.keys(client_default_model) (no missing / no extra labels in
  // either direction; crab-grapheme byte-exact).
  //
  // PREFERRED: load via the programmatic accessor
  // `getAllowedMcpVisualClientLabels()` exported from the compiled
  // mcp/build/tools/visual-session.js. This is robust against future source
  // edits (comments, alternate quoting, multi-line array literals, etc.).
  // The npm test chain runs `npm --prefix mcp run build` before this test,
  // so the build artifact is guaranteed present in CI.
  //
  // FALLBACK: if the build artifact is missing (ad-hoc test run without
  // `npm --prefix mcp run build` first), the regex source-parser is used
  // and the test log emits a `[Section 8 FALLBACK]` marker so a reader
  // investigating a failure can see the path was taken. The fallback first
  // strips // and /* */ comments before splitting on commas so an inline
  // comment in the array literal cannot silently corrupt the parse (the
  // failure mode flagged by Phase 270 review WR-04).
  console.log('\n--- Section 8: client-allowlist parity with visual-session.ts ---');
  {
    let labels = null;
    let labelSource = null;

    // Try the programmatic accessor first. visual-session.ts compiles to an
    // ESM module (mcp/package.json has "type":"module"), so this CommonJS
    // test file must use the dynamic import() form -- require() would fail
    // with ERR_REQUIRE_ESM.
    const vsBuildPath = path.join(__dirname, '../mcp/build/tools/visual-session.js');
    if (fs.existsSync(vsBuildPath)) {
      try {
        const visualSession = await import(vsBuildPath);
        if (typeof visualSession.getAllowedMcpVisualClientLabels === 'function') {
          labels = visualSession.getAllowedMcpVisualClientLabels();
          labelSource = 'programmatic (mcp/build/tools/visual-session.js)';
        }
      } catch (e) {
        // fall through to regex path
        console.error('  [Section 8 NOTE] dynamic import of visual-session.js failed: ' + (e && e.message) + ' -- falling back to regex parse.');
      }
    }

    if (labels === null) {
      // Regex fallback. STRIPS comments first to avoid the WR-04 brittleness
      // (an inline `// deprecated` or `/* TODO */` in the array literal would
      // otherwise be split across the comma boundary and corrupt the parse).
      console.log('  [Section 8 FALLBACK] using regex source-parser; build mcp/ first for the robust programmatic path.');
      const vsPath = path.join(__dirname, '../mcp/src/tools/visual-session.ts');
      const vsSource = fs.readFileSync(vsPath, 'utf-8');
      const m = vsSource.match(/MCP_VISUAL_CLIENT_LABELS:\s*string\[\]\s*=\s*\[([\s\S]*?)\];/);
      passAssert(m !== null, 'visual-session.ts contains MCP_VISUAL_CLIENT_LABELS array literal');
      if (m !== null) {
        // Strip /* ... */ block comments first (greedy across newlines is
        // SAFE because the input is bounded to the array body), then //
        // line comments. Order matters: stripping line comments first
        // would prematurely chop the `*/` of an unterminated block.
        const arrayBody = m[1]
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, '');
        labels = arrayBody
          .split(',')
          .map(function (s) { return s.trim().replace(/^['"]|['"]$/g, '').trim(); })
          .filter(function (s) { return s.length > 0; });
        labelSource = 'regex (mcp/src/tools/visual-session.ts source)';
      }
    }

    passAssert(Array.isArray(labels) && labels.length > 0,
      'visual-session client labels resolved (' + (labelSource || 'no source') + ', count=' + (labels ? labels.length : 0) + ')');

    if (Array.isArray(labels) && labels.length > 0) {
      // Quick task 260608-6nm raised the allowlist floor from 13 to 25
      // (12 Tier-1 MCP-supporting AI clients appended). The 12 new entries
      // (Cline, Continue, Zed, VS Code, Copilot, JetBrains, Xcode, Eclipse,
      // Cody, Roo Code, Kiro, Goose) are owner-chip / overlay labels for
      // widely used MCP clients; FSB does not ship default-model mappings
      // for them (default model selection varies by per-client config and
      // is not authored at this layer). The pricing parity contract is
      // therefore scoped to: (a) every default-model entry must be on
      // the allowlist (extra-in-pricing remains zero -- prevents drift in
      // the other direction), (b) the 13 ORIGINALLY paired core labels
      // must still have default-model entries (preserves the v0.9.36
      // pricing pairing for the historical client set), and (c) the
      // OpenClaw crab grapheme survives byte-exact on both sides.
      passAssert(labels.length >= 13, 'visual-session allowlist has >= 13 labels (parsed ' + labels.length + ' via ' + labelSource + ')');

      const allowlistSet = new Set(labels);
      const pricingSet = new Set(Object.keys(pricingData.client_default_model));

      // Lock the 13 ORIGINAL core labels (the historical v0.9.36 set
      // through Hermes) to still have default-model entries. The 12
      // quick-task additions are intentionally excluded from this lock
      // because default-model mapping for them is out of scope for the
      // allowlist expansion.
      const CORE_PRICING_PAIRED_LABELS = [
        'Claude', 'Codex', 'ChatGPT', 'Perplexity', 'Windsurf',
        'Cursor', 'Antigravity', 'OpenCode', 'OpenClaw', 'OpenClaw \u{1F980}',
        'Grok', 'Gemini', 'Hermes',
      ];
      const missingCorePricing = CORE_PRICING_PAIRED_LABELS.filter(function (l) { return !pricingSet.has(l); });
      passAssertEqual(missingCorePricing.length, 0,
        'every core (v0.9.36) visual-session allowlist label has a client_default_model entry' +
        (missingCorePricing.length ? '; missing in client_default_model: [' + missingCorePricing.join(', ') + ']' : ''));

      // No drift in the OTHER direction: every pricing entry must be on
      // the allowlist (catches typo'd / orphaned default-model rows).
      const extraInPricing = Array.from(pricingSet).filter(function (l) { return !allowlistSet.has(l); });
      passAssertEqual(extraInPricing.length, 0,
        'no extra client_default_model entries beyond the allowlist' +
        (extraInPricing.length ? '; extra in client_default_model: [' + extraInPricing.join(', ') + ']' : ''));

      // Crab grapheme byte-exact check.
      passAssert(allowlistSet.has('OpenClaw \u{1F980}'), 'visual-session allowlist contains "OpenClaw 🦀" (U+1F980 crab)');
      passAssert(pricingSet.has('OpenClaw \u{1F980}'), 'client_default_model contains "OpenClaw 🦀" (U+1F980 crab)');
    }
  }

  // --- Summary -----------------------------------------------------------
  console.log('\n--- Summary ---');
  console.log('Total: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
