---
phase: 270
status: passed
must_haves_verified: 11/11
review_status: findings_fixed
findings_addressed: 6/6 (1 BLOCKER + 4 WARNINGS + 1 INFO)
---

# Phase 270 Verification Report

All 11 must_haves from `270-01-PLAN.md` ship as code-complete and
unit-test-verified by the original phase landing (commits `6b2b88d` data,
`87a33fb` tests + npm test wiring, `b834320` TS+JS modules). The Phase 270
code review (`270-REVIEW.md`, 2026-05-14, status `findings_found`) surfaced
6 findings -- 1 BLOCKER, 4 WARNINGS, 1 INFO -- all of which have now been
addressed by the review-fix pass documented below. Final test counts:
167 PASS / 0 FAIL across `tests/mcp-pricing.test.js`, plus
`tests/mcp-pricing-data-parity.test.js` byte-exact green.

## Must-Haves Walkthrough

### must_have 1: mcp/data/mcp-pricing-data.json with May 2026 rates, source_url, source_date, confidence per row (PRICE-01)

**Truth claim:** `mcp/data/mcp-pricing-data.json` ships 30+ model rows
covering Anthropic 4.x, OpenAI GPT-5/5.x, Gemini 2.5+3.1, Grok 4.x, and
DeepSeek V4. Each row carries `input_per_mtok`, `output_per_mtok`,
`confidence` (HIGH/MEDIUM/LOW), `source_url`, `source_date`, optional
`notes`.

**Verification command:**
```bash
node tests/mcp-pricing.test.js 2>&1 | grep -E "(spot-check|confidence stamp)"
```

**Status:** PASS (Section 6 5-row spot-check + Section 7 confidence
completeness sweep).

---

### must_have 2: estimateMcpCost resolves every label in the 13-entry v0.9.36 allowlist with HIGH/MEDIUM/LOW confidence (PRICE-02)

**Truth claim:** `MCP_CLIENT_DEFAULT_MODEL` keys are byte-exact equal to
`mcp/src/tools/visual-session.ts:9-12` `MCP_VISUAL_CLIENT_LABELS` (asserted
at runtime via Section 8 of the test file).

**Verification command:**
```bash
node tests/mcp-pricing.test.js 2>&1 | grep -E "Section 8"
```

**Status:** PASS (programmatic accessor path after WR-04 fix).

---

### must_have 3: every model_pricing row carries source_url + source_date (PRICE-03)

**Truth claim:** Section 7 of the test file sweeps every row.

**Verification command:**
```bash
node tests/mcp-pricing.test.js 2>&1 | grep "source_url + source_date"
```

**Status:** PASS.

---

### must_have 4: unknown client + unknown model -> {cost: null, source: 'unknown', ...} (PRICE-04)

**Truth claim:** Section 3 unknown-path assertions + chaos sweep.

**Verification command:**
```bash
node tests/mcp-pricing.test.js 2>&1 | grep -E "Section 3|chaos sweep"
```

**Status:** PASS. The chaos sweep counter was split into `chaosThrows` +
`chaosShapeMisses` by the IN-01 fix so a future regression's FAIL message
points to the correct root cause.

---

### must_have 5: PRICING_SOURCE_DATE = '2026-05-14' on every result (PRICE-05)

**Truth claim:** Sections 1-5 all assert `pricing_source_date` on every
return shape.

**Verification command:**
```bash
node tests/mcp-pricing.test.js 2>&1 | grep "pricing_source_date"
```

**Status:** PASS (8+ assertions across all 4 resolver paths).

---

### must_have 6: resolver NEVER throws on any input

**Truth claim:** Section 3 chaos sweep with 10 hostile inputs (Symbol,
prototype-pollution strings, throwing getters, BigInt, etc.).

**Verification command:**
```bash
node tests/mcp-pricing.test.js 2>&1 | grep -E "chaos sweep|NEVER-throws"
```

**Status:** PASS (after IN-01 split, both `chaosThrows == 0` and
`chaosShapeMisses == 0` assertions report distinct failure modes).

---

### must_have 7: fallback path returns source='fallback', model_used=client's default model, pricing_confidence='fallback'

**Truth claim:** Section 2 covers all 13 client labels via fallback path.

**Verification command:**
```bash
node tests/mcp-pricing.test.js 2>&1 | grep -E "Section 2|fallback"
```

**Status:** PASS.

---

### must_have 8: missing tokensIn/tokensOut -> cost=null but model_used + source preserved

**Truth claim:** Section 4 covers null, undefined, NaN, Infinity,
-Infinity, string-shaped tokens, omitted tokens, zero, and (after WR-03
fix) negative tokens.

**Verification command:**
```bash
node tests/mcp-pricing.test.js 2>&1 | grep -E "Section 4|negative"
```

**Status:** PASS (10 new negative-token assertions added by WR-03).

---

### must_have 9: MCP_CLIENT_DEFAULT_MODEL keys byte-exact equal to visual-session.ts:9-12 allowlist

**Truth claim:** Section 8 client-allowlist parity test now uses the
programmatic `getAllowedMcpVisualClientLabels()` accessor from the
compiled `mcp/build/tools/visual-session.js` (after WR-04 fix), with a
robust comment-stripping regex fallback when the build artifact is
missing.

**Verification command:**
```bash
node tests/mcp-pricing.test.js 2>&1 | grep -E "Section 8|allowlist"
```

**Status:** PASS.

---

### must_have 10: extension/utils/mcp-pricing-data.json byte-exact equal to mcp/data/mcp-pricing-data.json

**Truth claim:** Dedicated CI gate test.

**Verification command:**
```bash
node tests/mcp-pricing-data-parity.test.js
```

**Result observed:**
```
PASS: mcp/data/mcp-pricing-data.json and extension/utils/mcp-pricing-data.json are byte-exact equal
```

**Status:** PASS.

---

### must_have 11: tests/mcp-pricing.test.js + tests/mcp-pricing-data-parity.test.js wired into npm test

**Truth claim:** `package.json` test chain runs both new tests between
`install-identity.test.js` and `transcript-store.test.js`.

**Verification command:**
```bash
grep -E "mcp-pricing\.test|mcp-pricing-data-parity" package.json
```

**Status:** PASS.

---

## Phase 270 Code-Review Fix Addendum (2026-05-14)

All 6 review findings from `270-REVIEW.md` have been addressed in atomic
commits on this branch:

| Finding | Severity | Commit | Files touched | Status |
|---|---|---|---|---|
| CR-01 | BLOCKER | `9aff6f5` | `mcp/package.json` | FIXED -- npm pack --dry-run now ships `data/mcp-pricing-data.json` (11.1kB) alongside `build/tools/pricing.js` |
| WR-01 | WARNING | `bbb4d8a` | `mcp/package.json` | FIXED -- `engines.node` bumped `>=18.0.0` -> `>=18.20.0` to match `with { type: 'json' }` syntax floor |
| WR-02 | WARNING | `829393e` | `extension/utils/mcp-pricing.js` | FIXED -- MV3 SW fetch now checks `r.ok`, emits one-shot console.warn, resets `_dataPromise = null` to permit retry |
| WR-03 | WARNING | `9f83e5d` | `mcp/src/tools/pricing.ts`, `extension/utils/mcp-pricing.js`, `tests/mcp-pricing.test.js`, `270-CONTEXT.md` | FIXED -- negative tokens rejected uniformly with missing/non-finite; 10 new regression assertions; CONTEXT.md Path 4 updated |
| WR-04 | WARNING | `f8f9848` | `tests/mcp-pricing.test.js` | FIXED -- Section 8 uses programmatic `getAllowedMcpVisualClientLabels()` import with comment-stripping regex fallback |
| IN-01 | INFO    | `eaa666e` | `tests/mcp-pricing.test.js` | FIXED -- `chaosThrows` split into throws vs shape-miss counters with distinct assertion messages |

### Final Verification Gates

```
$ node tests/mcp-pricing.test.js
Total: 167 passed, 0 failed

$ node tests/mcp-pricing-data-parity.test.js
PASS: mcp/data/mcp-pricing-data.json and extension/utils/mcp-pricing-data.json are byte-exact equal

$ npm --prefix mcp pack --dry-run | grep -E "data/|tools/pricing"
npm notice 7.6kB build/tools/pricing.d.ts
npm notice 10.1kB build/tools/pricing.js
npm notice 3.1kB build/tools/pricing.js.map
npm notice 11.1kB data/mcp-pricing-data.json
```

Test count grew 156 -> 167 across this review-fix pass:
- +10 negative-token regression assertions (WR-03)
- +1 source-attribution / count-confirmation assertion (WR-04)
- +1 split chaos-shape-miss counter assertion (IN-01)
- -1 inlined `m !== null` guard replaced by the source-attributed equivalent (WR-04)

No regressions introduced. The NEVER-throws contract still holds; module-load
invariant still catches broken client_default_model references; byte-exact
parity gate still green.

---

_Verified: 2026-05-14_
_Review-fix pass: gsd-code-fixer (Phase 270, 6/6 findings addressed)_
_Status: passed_
