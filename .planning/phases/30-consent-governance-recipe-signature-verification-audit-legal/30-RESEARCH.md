# Phase 30: Consent Governance + Recipe Signature Verification + Audit + Legal Posture - Research

**Researched:** 2026-06-21
**Domain:** MV3 service-worker security gating (consent), Ed25519/JCS cryptographic verification, append-only redacted audit logging, control-panel settings UI, legal posture
**Confidence:** HIGH (the three primary unknowns resolved against authoritative sources; all integration points verified in-repo)

## Summary

This is the security phase: it wraps the single Phase-29 capability chokepoint (`FsbCapabilityRouter.invoke`) in a default-OFF per-origin consent gate, gates mutations behind a separate elevated opt-in, adds an Ed25519/JCS signature-verify hook inside `interpretRecipe` for non-bundled recipes, ships a secret-free append-only audit log, surfaces a Consent & Audit control-panel section, and documents a legal/ToS posture plus a service denylist. The CONTEXT.md is spec-grade (D-01..D-16 locked); this research **consolidates** it and resolves the three genuine technical unknowns the CONTEXT deliberately left to the planner.

All three unknowns resolved with verified facts. **(1) Ed25519 via Web Crypto:** `crypto.subtle.verify({name:'Ed25519'}, ...)` shipped **unprefixed in Chrome 137** (Safari 17, Firefox 129) `[CITED: caniuse.com]`. The FSB manifest declares **no `minimum_chrome_version`** `[VERIFIED: extension/manifest.json]`, so a runtime feature-detect is mandatory and a bundled eval-free fallback (`@noble/ed25519` verify path) is the safe contingency. **(2) JCS canonicalization:** the recipe JSON is a closed, shallow, all-string/enum vocabulary `[VERIFIED: capability-recipe-schema.js:79-148]` — none of RFC 8785's hard cases (IEEE-754 number serialization, non-BMP surrogate-pair key sorting) can arise, so a focused ~40-line in-house deterministic serializer beats a third-party dependency on auditability and the eval-free CI guard. **(3) Consent "Ask" out-of-band UX:** both front doors already resolve `{origin, tabId, source}` SW-side before `invoke` `[VERIFIED: mcp-tool-dispatcher.js:2208-2236, tool-executor.js:672-716]`, and `chrome.action.setBadgeText` is already used across the SW today `[VERIFIED: background.js:7552, ws-client.js:2141-2153]` — so the typed `CONSENT_REQUIRED` return + chrome.storage.local pending-record + badge flow needs no new permission and no architectural invention.

**Primary recommendation:** Realize signature verify as `await crypto.subtle.verify({name:'Ed25519'})` with a one-time runtime feature-detect; bundle `@noble/ed25519`'s verify-only path as the eval-free fallback (decision criteria below). Use a focused in-house JCS serializer (not a dependency) for the closed recipe shape. Place the three new modules under `extension/utils/` as `consent-policy-store.js`, `audit-log.js`, and the signature module as **`capability-signature.js`** (so Check 4's `capability-*` glob auto-covers it) — and add all three to `RECIPE_PATH_ALLOWLIST`. Clone `diagnostics-ring-buffer.js` verbatim for the audit ring and `agent-registry.js`'s versioned-envelope storage for the consent store. Mirror the Phase-245 change-report toggle EXACTLY for the UI.

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-16 — authoritative, do NOT re-derive)

**Consent Model & Enforcement (GOV-01..04)**
- **D-01:** Consent gate is a **wrapper around `FsbCapabilityRouter.invoke`** (`capability-router.js:182`) — the single chokepoint both front doors reach — enforced **after the existing ownership gate**. One gate, both doors. No second/parallel gate per front door.
- **D-02:** Per-origin consent lives in a NEW `extension/utils/consent-policy-store.js` over `chrome.storage.local` as a versioned envelope `{ v, policies: { [origin]: { mode } }, defaultMode }`. **Default OFF per origin.** Auto is an explicit per-origin opt-in, never a global switch.
- **D-03:** "Ask" mode returns a typed **`CONSENT_REQUIRED`** error at invoke time — NOT a blocking in-page modal. Pending request surfaced out-of-band (control-panel + badge/notice); once granted, caller may retry. Planner names exact `CONSENT_*` codes; must surface through existing error passthrough without an `errors.ts` schema break.
- **D-04:** Mutation gating (GOV-03): side-effect class from `MUTATING_METHODS` (`capability-fetch.js:228`) + handler/recipe `sideEffectClass`. **Mutating invokes require a SEPARATE elevated per-origin opt-in** — read-Auto does NOT imply write-Auto. Mutating always surfaces in the Ask prompt + triggers disambiguation before any mutating invoke.

**Recipe Signature Verification (SIGN-01, SIGN-02)**
- **D-05:** Realize SIGN-01 "Ed25519/JCS via Lattice receipts" with a NEW pure `extension/utils/recipe-signature.js` (this research recommends naming it `capability-signature.js` — see Open Questions) using **Web Crypto `crypto.subtle` Ed25519** over the **JCS (RFC 8785) canonical form**. "Lattice receipt" = the provenance-envelope shape (signature + captured-at + schema-hash). Eval-free; joins `RECIPE_PATH_ALLOWLIST`.
- **D-06:** Verification enforced **inside `interpretRecipe`** (`capability-interpreter.js:124`) **AFTER schema validation, BEFORE binding**. Unverified/tampered recipe rejected with typed **`RECIPE_SIGNATURE_INVALID`** (matches `/^RECIPE_.+$/`, dual-field via `createRecipeError`, surfaces verbatim — no `errors.ts` edit).
- **D-07:** Verification REQUIRED only for **non-bundled provenance** (server/learned — Phase 31). **First-party bundled recipes are trusted-by-provenance and exempt** from the verify gate, BUT carry SIGN-02 integrity metadata so the path is exercised on a fixture. A `provenance` field distinguishes `bundled` vs `server`/`learned`.
- **D-08:** Trusted public key(s) ship in the extension bundle (config). Private signing key is offline/CI (Phase 31). Phase 30 ships verify path + a **fixture keypair** (sign fixture → verify-pass; tamper → `RECIPE_SIGNATURE_INVALID`).

**Audit Log & Redaction (GOV-05, GOV-06)**
- **D-09:** NEW `extension/utils/audit-log.js` over `chrome.storage.local` as an append-only versioned envelope `{ v, entries: [...] }` (mirrors `diagnostics-ring-buffer.js`), bounded (ring) with an archival/export hook.
- **D-10:** Entry schema: `{ ts, origin, slug, method, sideEffectClass, consentDecision, outcome, error? }`. NEVER args, tokens, cookies, CSRF, or response bodies.
- **D-11:** Every field passes through existing **`redactForLog`** (`redactForLog.js:29-63`) before persistence. New test asserts NO auth substring (cookie/token/CSRF/`xoxc`/`_gh_sess`/bearer) survives.
- **D-12:** Retention: bounded ring + user "export & clear" control. Retention policy documented in `docs/LEGAL.md`.

**Control-Panel UI & Legal Posture (GOV-07, GOV-08)**
- **D-13:** NEW "Consent & Audit" section in `control_panel.html` (add `data-section` at `:54+`) wired through `options.js`, following the **Phase-245 change-report toggle pattern** EXACTLY. Per-origin consent list (Off/Ask/Auto + elevated mutating opt-in) + audit-log viewer (+ export/clear).
- **D-14:** Sensitive-origin classifier (banking/email/government heuristics + denylist) forces Ask / extra confirmation EVEN under Auto; visually flags those origins.
- **D-15:** Legal posture: NEW `docs/LEGAL.md` + NEW `extension/config/service-denylist.json` (`{ v, deniedOrigins:[...], deniedReason }`), loaded at SW startup and checked in the consent gate **BEFORE** per-origin policy. Linked from control panel + showcase privacy page.
- **D-16:** Denylist ships a conservative category seed (banking/government/primary-email patterns) with an "automation prohibited" reason, user-extensible — NOT empty, NOT an aggressive broad blocklist.

### Claude's Discretion
- Exact `CONSENT_*` reason-code names and how the pending-Ask request is surfaced (badge text, control-panel queue).
- Storage-envelope version numbers and the consent-store / audit-log API surface names.
- JCS canonicalization implementation details (vendor minimal RFC-8785 vs. focused in-house serializer) and the audit ring size.
- Control-panel layout specifics WITHIN the Phase-245 settings-card pattern; sensitive-origin heuristic thresholds.
- Whether `recipe-signature.js` / `consent-policy-store.js` / `audit-log.js` live under `extension/utils/` and which join `RECIPE_PATH_ALLOWLIST` (any on the recipe/interpret path MUST be eval-free + allowlisted).

### Deferred Ideas (OUT OF SCOPE — do not pull in)
- Real server-delivered / learned recipe **SIGNING** (private-key signer, capture→synthesis→promotion) — **Phase 31**. Phase 30 ships only the VERIFY path + fixture keypair.
- Audit-log long-term archival / rotation depth beyond a bounded ring + export — documented in LEGAL.md; deeper tooling later.
- Exhaustive service denylist — conservative category seed only.
- Encrypted audit log at rest — out of scope (log is secret-free by construction).

## Project Constraints (from CLAUDE.md)

- **NO emojis** anywhere in logs, markdown, source, or UI copy (global + project rule). The recipe-path guard scans even comments; the UI test asserts emoji-absence (UI-SPEC AC).
- Browser-automation tasks use FSB MCP tools (not relevant to this code-only phase).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GOV-01 | Capability execution default-OFF per origin | `consent-policy-store.js` versioned envelope with `defaultMode:'off'`; gate returns `CONSENT_REQUIRED` for any origin not explicitly enabled. Storage pattern verified in `agent-registry.js:80-120`. |
| GOV-02 | Per-origin Off / Ask / Auto, Auto is per-origin opt-in never global | Three-mode enum per origin in the envelope; no global "enable all" key. Segmented control (Off/Ask/Auto) in UI per UI-SPEC. |
| GOV-03 | Mutating calls require elevated consent, surfaced in Ask, disambiguated | `MUTATING_METHODS` (`capability-fetch.js:228`) + recipe/handler `sideEffectClass` classify; separate `mutating` boolean per origin in the envelope; mutating-Auto is a second opt-in. |
| GOV-04 | Gate at single dispatch chokepoint, immediately after ownership gate | Wrap `FsbCapabilityRouter.invoke` (`capability-router.js:182`). Ownership gate is upstream at the front doors / agent-registry; consent is the next gate in the same chokepoint (D-01). |
| GOV-05 | Append-only audit log: origin, capability, method, side-effect, decision, outcome, ts; never secrets | Clone `diagnostics-ring-buffer.js` → `audit-log.js`; entry schema D-10 excludes args/bodies by construction. |
| GOV-06 | Auth material never leaves device / persisted; tested redactor asserts no auth substrings | Route every field through `redactForLog` (`redactForLog.js:29-63`); no-auth-substring test (D-11). Schema + redactor + test = triple enforcement. |
| GOV-07 | Control-panel UI for per-origin consent + audit log; sensitive origins extra friction under Auto | Phase-245 toggle pattern (`control_panel.html` + `options.js` + `change-report-settings-ui.test.js`); sensitive classifier D-14; full UI contract in 30-UI-SPEC.md. |
| GOV-08 | Documented legal/ToS posture + service denylist | NEW `docs/LEGAL.md` + `extension/config/service-denylist.json`; denylist checked first in gate (D-15). |
| SIGN-01 | Server-delivered recipes signature-verified (Ed25519/JCS); unverified/tampered rejected | Web Crypto Ed25519 verify over JCS canonical form; `RECIPE_SIGNATURE_INVALID` on failure (D-05/D-06). Chrome 137+ native; noble fallback. |
| SIGN-02 | Integrity metadata (signature, captured-at, schema hash) travels with recipe, checked by interpreter before binding | Provenance envelope shape; verify hook in `interpretRecipe` after schema-validate, before bind (D-06). Exercised on fixture even for bundled recipes (D-07). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-origin consent decision | MV3 Service Worker (gate around `invoke`) | chrome.storage.local (persistence) | The chokepoint is SW-side; consent must be enforced where both front doors converge, not per-front-door (INV-02). |
| Consent policy storage | chrome.storage.local (versioned envelope) | — | Survives SW eviction; cross-restart state (the agent-registry / diagnostics-ring precedent). |
| Mutation classification | MV3 Service Worker (gate) | `capability-fetch.js` MUTATING_METHODS + recipe metadata | Side-effect class derived at dispatch from the method + recipe `sideEffectClass`. |
| Ed25519 signature verify | MV3 Service Worker (Web Crypto) | bundled `@noble/ed25519` fallback | `crypto.subtle` is a SW-global; verify runs inside `interpretRecipe` in the SW. Fallback is pure-JS, no platform dependency. |
| JCS canonicalization | MV3 Service Worker (in-house serializer) | — | Pure function over the closed recipe shape; eval-free; on the recipe-path allowlist. |
| Audit log append + redaction | MV3 Service Worker (gate emits) | chrome.storage.local ring | Gate is the single place every invoke flows through; redactForLog is a pure SW/content helper. |
| Pending-Ask surfacing | chrome.storage.local (pending record) + chrome.action (badge) | Control-panel UI (options page) | SW cannot show a synchronous modal; it persists a pending record and sets a badge; the options page renders/grants out-of-band. |
| Consent & Audit UI | Browser (options page, vanilla HTML/JS) | options.js wiring + the two stores | MV3 options page; reuses the existing control-panel component language (UI-SPEC). |
| Service denylist | extension/config (bundled JSON) + SW load | Control-panel link | Loaded at SW startup; checked in the gate BEFORE per-origin policy (D-15). |

## Standard Stack

### Core (already in-repo — reuse, do not re-add)

| Asset | Location | Purpose | Why Standard |
|-------|----------|---------|--------------|
| `FsbCapabilityRouter.invoke` | `capability-router.js:182` | The single chokepoint the gate wraps | One engine, both doors (INV-02). `[VERIFIED: capability-router.js:182-216]` |
| `redactForLog` | `redactForLog.js:29-63` | Shape-only redactor for the audit log | URLs→origin, strings→{kind,length}, errors→name+message, no bodies. `[VERIFIED: redactForLog.js:29-63]` |
| `MUTATING_METHODS` | `capability-fetch.js:228` | Read-vs-mutating classifier (GOV-03) | `{POST,PUT,PATCH,DELETE}`. `[VERIFIED: capability-fetch.js:228]` |
| `diagnostics-ring-buffer.js` | full file | Append-only chrome.storage.local ring to clone for `audit-log.js` | FIFO, persisted, in-memory shadow, export/clear, field-whitelist on append. `[VERIFIED: diagnostics-ring-buffer.js:1-122]` |
| `agent-registry.js` storage helpers | `:80-120` | Versioned-envelope read/write to clone for `consent-policy-store.js` | `{ v, records }`, lazy `globalThis.chrome`, swallow-to-null. `[VERIFIED: agent-registry.js:80-120]` |
| `createRecipeError` | `capability-interpreter.js:85-93` / `capability-recipe-schema.js:169-177` | Dual-field typed-error helper | Sets `code`+`errorCode`+`error` so `RECIPE_*`/`CONSENT_*` surface verbatim. `[VERIFIED: capability-interpreter.js:85-93]` |
| `chrome.action.setBadgeText` | already used `background.js:7552`, `ws-client.js:2141-2153`, `memory-extractor.js:519-520` | The pending-Ask badge | `action` key already in manifest; SW-callable; established pattern. `[VERIFIED: grep in-repo]` |
| `@cfworker/json-schema` | `extension/lib/cfworker-json-schema.min.js` | (Indirect) recipe schema validation precedes verify | The verify hook slots after this. `[VERIFIED: capability-interpreter.js:236-250]` |

### Supporting (NEW — vendor only the fallback; prefer native + in-house)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Crypto `crypto.subtle` Ed25519 | native (Chrome 137+) | Primary signature verify | First choice. `await crypto.subtle.verify({name:'Ed25519'}, pubKey, sig, msgBytes)`. `[CITED: caniuse.com — Chrome 137]` |
| `@noble/ed25519` (verify path only) | `3.1.0` | Eval-free pure-JS fallback when Web Crypto Ed25519 absent | Bundle only if the feature-detect can fail on a supported floor; see decision criteria. `[ASSUMED — discovered via WebSearch; npm-confirmed 3.1.0, 0 deps]` |
| `@noble/hashes` (sha512 only) | `2.2.0` | SHA-512 for `@noble/ed25519` **synchronous** verify | Required ONLY if using the noble fallback in sync mode. v3 wires `ed.hashes.sha512 = sha512`. `[ASSUMED — npm-confirmed 2.2.0]` |
| In-house JCS serializer | n/a (write ~40 lines) | RFC-8785 canonical form of the closed recipe shape | Recommended over a dependency — see JCS section. No package. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-house JCS serializer | `canonicalize@3.0.0` (npm) | The package is a full RFC-8785 impl (handles floats, surrogate pairs) — but those cases **cannot arise** for the closed recipe shape, so it is dead weight that must still be vendored, allowlisted, and eval-scanned. In-house is smaller, fully auditable, and trivially eval-free. `[ASSUMED — canonicalize npm-confirmed 3.0.0]` |
| `@noble/ed25519` fallback | `tweetnacl` | tweetnacl is older, larger, bundles more than verify, and is less actively maintained. noble's verify-only path is ~3.9KB gzipped and self-audited 2026-03. `[CITED: github.com/paulmillr/noble-ed25519]` |
| Native Web Crypto primary | noble-only (skip native) | Skipping native forgoes the platform's constant-time, audited implementation for zero benefit on Chrome 137+. Native-first + fallback is strictly better. |

**Installation (only if the noble fallback is adopted):**
```bash
# Verify on the correct registry BEFORE vendoring (slopcheck was unavailable this session):
npm view @noble/ed25519 version    # expect 3.1.0, 0 dependencies
npm view @noble/hashes version     # expect 2.2.0
# Then vendor the minified verify build into extension/lib/ (NOT npm-install into the SW),
# mirroring how cfworker/jmespath/minisearch are shipped as extension/lib/*.min.js.
```

**Version verification performed this session (npm registry, 2026-06-21):**
- `@noble/ed25519` → `3.1.0`, 0 dependencies, ~121KB unpacked source (verify path minifies far smaller), published 2026-04-11. `[VERIFIED: npm view]`
- `@noble/hashes` → `2.2.0`. `[VERIFIED: npm view]`
- `canonicalize` → `3.0.0`. `[VERIFIED: npm view]`

## Package Legitimacy Audit

> slopcheck could **not** be installed this session (`pip install slopcheck` unavailable). Per protocol, every recommended external package is tagged `[ASSUMED]` and the planner MUST gate each vendoring step behind a `checkpoint:human-verify` task before bundling. Registry existence alone does not confer VERIFIED status (a slopsquat also passes `npm view`).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@noble/ed25519` | npm | mature (v1 audited cure53 Feb 2022; v3.1.0 Apr 2026) | very high (foundational crypto dep) | github.com/paulmillr/noble-ed25519 | unavailable | **Flagged — planner adds checkpoint:human-verify before vendoring** |
| `@noble/hashes` | npm | mature | very high | github.com/paulmillr/noble-hashes | unavailable | **Flagged — checkpoint before vendoring (only if sync noble path used)** |
| `canonicalize` | npm | mature (v3.0.0) | high | github.com/cyberphone/json-canonicalization (et al.) | unavailable | **NOT recommended** — in-house serializer preferred; listed only as the rejected alternative |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck did not run).
**Packages flagged for human verification before install:** `@noble/ed25519`, `@noble/hashes` (fallback path only). The recommended primary path (native Web Crypto + in-house JCS) installs **zero** new packages — preferred precisely because it sidesteps the supply-chain surface entirely on the recipe path.

**Recommendation to minimize supply-chain risk:** Adopt native-Web-Crypto-first. Only if the feature-detect contingency is exercised should the noble fallback be vendored, and then as a pinned, integrity-checked, manually-reviewed `extension/lib/*.min.js` (the existing vendoring convention), never as a live `npm install` into the extension.

## Architecture Patterns

### System Architecture Diagram

```
                          FRONT DOORS (both resolve {origin, tabId, source} SW-side)
       MCP dispatcher                                        Autopilot
  handleCapabilitiesInvokeMessageRoute              executeCapabilityToolForAutopilot
  (mcp-tool-dispatcher.js:2208-2236)                 (tool-executor.js:672-716)
            |                                                   |
            |   ctx = { origin, tabId }            ctx = { origin, tabId, source:'autopilot' }
            +-------------------------+-------------------------+
                                      |
                                      v
                   ====================================================
                   ||   FsbCapabilityRouter.invoke (capability-router.js:182)   ||
                   ||   --- THE SINGLE CHOKEPOINT (D-01) ---                    ||
                   ====================================================
                                      |
                   [ existing ownership gate is UPSTREAM at front doors / agent-registry ]
                                      |
                                      v
        +===================== CONSENT GATE (NEW wrapper, D-01) =====================+
        |  1. denylist check (service-denylist.json)  -- BEFORE policy (D-15)        |
        |        deniedOrigins.has(origin) ? -> CONSENT_BLOCKED (typed return)       |
        |  2. consent-policy-store lookup (default OFF, D-02)                        |
        |        mode === 'off'   -> CONSENT_REQUIRED (no record; surface out-of-band)|
        |        mode === 'ask'   -> write pending record + badge -> CONSENT_REQUIRED |
        |        mode === 'auto'  -> continue                                        |
        |  3. mutation gate (D-04): sideEffectClass(method, recipe) === mutating ?   |
        |        require elevated per-origin opt-in; else CONSENT_REQUIRED (mutating) |
        |  4. sensitive-origin classifier (D-14): force Ask/confirm even under Auto  |
        +===========================================================================+
                                      |  (allowed)
                                      v
                       catalog.resolve(slug, origin) -> tier dispatch
                                      |
                T0/T1b: interpretRecipe (capability-interpreter.js:124)
                                      |
        +============ SIGNATURE VERIFY HOOK (NEW, D-06: after schema-validate, before bind) ====+
        |  recipe.provenance === 'bundled' ? -> EXEMPT (D-07), continue              |
        |  else: JCS-canonicalize(recipe core) -> Ed25519 verify(sig, canon, pubKey) |
        |        crypto.subtle Ed25519 (Chrome 137+) | noble fallback                |
        |        verify fail/absent sig -> RECIPE_SIGNATURE_INVALID (typed return)   |
        +=====================================================================================+
                                      |  (verified or exempt)
                                      v
                       bindAuthStrategy -> bound spec -> executeBoundSpec
                       (origin-pin still holds; gate sits ABOVE this -- INV-04)
                                      |
        +-------------------- AUDIT LOG APPEND (NEW, D-09/D-10/D-11) -----------------+
        |  every invoke outcome -> redactForLog each field -> append to ring         |
        |  { ts, origin, slug, method, sideEffectClass, consentDecision, outcome, error? }|
        +---------------------------------------------------------------------------+

       OUT-OF-BAND (options page, NOT in the invoke path):
         control_panel.html "Consent & Audit" section <--reads/writes-- consent-policy-store
                                                       <--reads-------- audit-log ring
                                                       <--reads/grant-- pending records
         chrome.action badge reflects pending count
```

A reader can trace one invoke from a front door, through the denylist → consent → mutation → sensitive checks, into the tier dispatch + signature hook, down to the bound-spec execution, with an audit append on the outcome — and separately see the options page reading/writing the same two stores out-of-band.

### Recommended Module Placement

```
extension/utils/
├── consent-policy-store.js     # NEW  -- per-origin Off/Ask/Auto + elevated mutating; default OFF (D-02)
├── audit-log.js                # NEW  -- append-only redacted ring over chrome.storage.local (D-09)
├── capability-signature.js     # NEW  -- JCS + Ed25519 verify; reached from interpretRecipe (D-05)
│                               #         NAMED capability-* so Check 4 glob AUTO-covers it
├── capability-router.js        # MODIFIED -- invoke wrapped by consent+mutation gate (D-01)
├── capability-interpreter.js   # MODIFIED -- signature-verify hook after schema-validate, before bind (D-06)
└── redactForLog.js             # REUSED (no change)
extension/config/
└── service-denylist.json       # NEW  -- { v, deniedOrigins:[...], deniedReason } (D-15)
extension/ui/
├── control_panel.html          # MODIFIED -- Consent & Audit section (D-13)
└── options.js                  # MODIFIED -- cacheElements/listeners/render wiring (D-13)
extension/background.js         # MODIFIED -- additive importScripts + denylist load at SW startup
scripts/verify-recipe-path-guard.mjs  # MODIFIED -- allowlist the new recipe-path modules
docs/LEGAL.md                   # NEW  -- ToS/legal posture + retention + consent model (D-15)
catalog/recipes/_fixtures/      # NEW fixtures -- signed + tampered recipe + fixture pubkey (D-08)
```

### Pattern 1: Native-first Ed25519 verify with one-time feature-detect
**What:** Try `crypto.subtle.verify({name:'Ed25519'}, ...)`; cache the capability; fall back to the bundled noble verify only if native is absent or throws `NotSupportedError`.
**When to use:** The signature module's verify entrypoint.
**Example:**
```javascript
// Source: MDN SubtleCrypto.verify (caniuse: Chrome 137+) + noble-ed25519 README (v3 API)
// capability-signature.js (eval-free; on RECIPE_PATH_ALLOWLIST)
var _ed25519Native = null; // tri-state cache: null=unknown, true/false=detected

async function _detectNativeEd25519() {
  if (_ed25519Native !== null) return _ed25519Native;
  try {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : null;
    if (!c || !c.subtle || typeof c.subtle.importKey !== 'function') { _ed25519Native = false; return false; }
    // A no-op import is the cheapest reliable probe; a 32-byte zero key is a valid
    // raw Ed25519 public key length. importKey rejects with NotSupportedError on
    // pre-137 Chrome where Ed25519 is unregistered.
    await c.subtle.importKey('raw', new Uint8Array(32), { name: 'Ed25519' }, false, ['verify']);
    _ed25519Native = true;
  } catch (_e) {
    _ed25519Native = false;
  }
  return _ed25519Native;
}

async function verifyEd25519(pubKeyRaw, sigBytes, msgBytes) {
  if (await _detectNativeEd25519()) {
    var key = await globalThis.crypto.subtle.importKey('raw', pubKeyRaw, { name: 'Ed25519' }, false, ['verify']);
    return await globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, sigBytes, msgBytes);
  }
  // Fallback (only if bundled): noble v3 verify(signature, message, publicKey).
  // NOTE v3 breaking change: sha512 is wired via ed.hashes.sha512 (v2 used ed.etc.sha512Sync).
  // Use { zip215: false } for strict RFC8032 non-repudiation (recommended for signature gating).
  var ed = (typeof globalThis !== 'undefined') ? globalThis.nobleEd25519 : null;
  if (!ed || typeof ed.verify !== 'function') { return false; } // no verifier -> fail closed
  try { return ed.verify(sigBytes, msgBytes, pubKeyRaw, { zip215: false }); }
  catch (_e) { return false; }
}
```
**Why fail-closed:** A missing verifier returns `false` (→ `RECIPE_SIGNATURE_INVALID`), never "assume valid." Since bundled recipes are exempt by provenance (D-07), this only ever blocks **non-bundled** recipes, so failing closed cannot break the working Phase-29 head.

### Pattern 2: In-house JCS canonical serializer for the closed recipe shape
**What:** A ~40-line deterministic serializer that lexicographically sorts object keys by UTF-16 code unit, emits `JSON.stringify` for the always-safe scalar set (strings, the `schemaVersion` const integer, booleans), and recurses objects/arrays.
**When to use:** Producing the byte string that Ed25519 signs/verifies.
**Example:**
```javascript
// Source: RFC 8785 sec. 3.2.3 (key sort = UTF-16 code-unit order) + sec 3.2.2.
// Valid ONLY because the recipe vocabulary is closed: all values are strings,
// enums, a const integer (schemaVersion=1), booleans, or shallow string objects.
// No floats, no large integers, no non-BMP keys -> the RFC's hard cases never arise.
function jcsCanonicalize(value) {
  if (value === null) return 'null';
  var t = typeof value;
  if (t === 'string' || t === 'boolean') return JSON.stringify(value);
  if (t === 'number') {
    // The closed shape only ever carries small safe integers (schemaVersion).
    // For an integer, JSON.stringify already yields the RFC-8785 shortest form.
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error('JCS: non-integer number outside closed recipe vocabulary');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(jcsCanonicalize).join(',') + ']';
  }
  if (t === 'object') {
    var keys = Object.keys(value).sort(); // default sort = UTF-16 code-unit order
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      parts.push(JSON.stringify(keys[i]) + ':' + jcsCanonicalize(value[keys[i]]));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('JCS: unserializable value');
}
```
**Critical correctness note:** JavaScript's default `Array.prototype.sort()` on strings IS UTF-16 code-unit order (the exact RFC 8785 §3.2.3 requirement) `[CITED: rfc-editor.org/rfc8785]` — so no custom comparator is needed for the ASCII recipe keys. The `throw` on a non-integer number is a tripwire: if the recipe vocabulary ever gains a float, the canonicalizer fails loudly rather than producing a non-deterministic byte string. **What gets canonicalized:** the recipe core fields (the signed payload), NOT the signature/provenance envelope wrapping them — the planner must define exactly which fields are inside the signature (recommend: the full recipe object minus the `signature` field itself, with `captured-at` and `schema-hash` included so they are tamper-evident).

### Pattern 3: Consent gate as a wrapper that preserves the invoke return contract
**What:** The gate wraps `invoke` and returns the SAME shape — either the downstream result or a typed `CONSENT_*` error — so callers and the errors.ts passthrough are unchanged.
**When to use:** The only behavioral modification to the Phase-29 router.
**Example:**
```javascript
// capability-router.js -- the gate sits at the TOP of invoke, after catalog resolve is
// reached but BEFORE tier dispatch. Returns dual-field typed errors (createRecipeError-style).
// CONSENT_* codes match neither RECIPE_ nor CODE_ONLY sets yet -- see errors.ts note below.
async function invoke(slug, args, ctx) {
  var c = ctx || {};
  // (existing catalog-unavailable / RECIPE_NOT_FOUND checks unchanged)
  // --- NEW consent gate (D-01), AFTER ownership (upstream), BEFORE tier dispatch ---
  var gate = await FsbConsentGate.evaluate({ origin: c.origin, slug: slug, method: methodOf(entry, args), entry: entry });
  if (gate.decision !== 'allow') {
    await FsbAuditLog.append({ ts: Date.now(), origin: c.origin, slug: slug, method: gate.method,
      sideEffectClass: gate.sideEffectClass, consentDecision: gate.decision, outcome: 'blocked' });
    return gate.error; // typed CONSENT_REQUIRED / CONSENT_BLOCKED (dual-field)
  }
  // ... existing switch(entry.tier) dispatch ...
  // (audit-append the outcome of the dispatched call on the way out)
}
```

### Anti-Patterns to Avoid
- **Second consent gate per front door** — wrap the single router chokepoint only (INV-02). Both doors already resolve `{origin,tabId}` and pass it in.
- **Synchronous modal for "Ask"** — there is no synchronous user prompt during an MCP/autopilot call. Return `CONSENT_REQUIRED`, persist a pending record, set a badge, resolve out-of-band.
- **Verify-gating bundled recipes** — they are trusted-by-provenance (D-07). Gating them would red the working Phase-29 head. Gate ONLY `provenance !== 'bundled'`.
- **Logging any arg/body/header in the audit log** — schema (D-10) excludes them; redactForLog (D-11) is a second layer; the no-auth-substring test is the third.
- **Bypassing the origin-pin** — the gate sits ABOVE `executeBoundSpec`; the two-point origin-pin (Phase 27) and INV-01/02/04 all still hold.
- **`eval`/`new Function`/`import()` anywhere on the recipe path** — `capability-signature.js` is reached from `interpretRecipe`, so it MUST be eval-free AND allowlisted or Check 1/4 reds. Keep the literal forbidden patterns out of even comments (the guard scans comments).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ed25519 verification math | A custom curve25519 implementation | Native `crypto.subtle` Ed25519 (Chrome 137+); bundled `@noble/ed25519` fallback | Constant-time, audited; hand-rolled EdDSA is a catastrophic footgun (timing/validation bugs). |
| SHA-512 (for noble sync path) | A custom SHA-512 | `@noble/hashes` sha512 | Same auditability argument; only needed if the noble sync fallback is used. |
| Append-only ring + persistence | A new storage ring | Clone `diagnostics-ring-buffer.js` | Already solves FIFO trim, in-memory shadow, export/clear, field-whitelist, lastError-swallow. |
| Versioned storage envelope | A new storage read/write | Clone `agent-registry.js:80-120` helpers | Already solves `{v,...}` versioning, lazy chrome, swallow-to-null, remove-on-empty. |
| Shape-only redaction | A new redactor | `redactForLog` (`redactForLog.js:29-63`) | CONTEXT explicitly says "No new redactor needed." |
| Settings toggle persistence | A bespoke settings flow | Phase-245 change-report pattern (`options.js` + `change-report-settings-ui.test.js`) | UI-SPEC mandates mirroring it EXACTLY; the test template already exists. |
| Typed error passthrough | An `errors.ts` schema edit | `createRecipeError` dual-field + `/^RECIPE_.+$/` | INV-01: MCP wire contracts UNTOUCHED. `RECIPE_SIGNATURE_INVALID` already matches; see CONSENT_* note. |
| JCS for arbitrary JSON | A full RFC-8785 library | A focused in-house serializer (closed shape) | The hard RFC cases (floats, surrogate pairs) cannot occur for this vocabulary; in-house is smaller and auditable. |

**Key insight:** This phase is overwhelmingly *assembly of existing FSB primitives* plus *one genuinely new cryptographic capability*. The crypto is the only place to reach outside the repo — and even there, native Web Crypto is the first choice. Everything else (storage rings, envelopes, redaction, the settings UI, the typed-error passthrough) is a clone of a proven in-repo pattern.

## Common Pitfalls

### Pitfall 1: Assuming Web Crypto Ed25519 is always present
**What goes wrong:** Calling `crypto.subtle.verify({name:'Ed25519'})` on Chrome < 137 throws `NotSupportedError`, and an unguarded call would crash the verify hook or (worse) be caught and misread as a verification failure.
**Why it happens:** Ed25519 shipped unprefixed only in **Chrome 137** `[CITED: caniuse.com]`, and the FSB manifest declares **no `minimum_chrome_version`** `[VERIFIED: extension/manifest.json]`, so the floor is whatever the user is running.
**How to avoid:** The one-time feature-detect in Pattern 1 (cached tri-state) + the bundled noble fallback. Decision criteria below decide whether to bundle the fallback at all.
**Warning signs:** `NotSupportedError` / `OperationError` from `crypto.subtle`; verify "fails" only on older Chrome.

### Pitfall 2: noble v2→v3 SHA-512 wiring breaking change
**What goes wrong:** Following a v2 tutorial wires `ed.etc.sha512Sync = ...`, but v3 (3.1.0) moved hashes to `ed.hashes.sha512 = sha512`; the sync verify then throws "sha512 not set."
**Why it happens:** `@noble/ed25519` v3 is a breaking release: methods expect `Uint8Array`, hex inputs prohibited, hashes relocated, Node ≥ 20.19. `[CITED: github.com/paulmillr/noble-ed25519 releases]`
**How to avoid:** Pin the vendored noble version and wire `ed.hashes.sha512 = sha512` from `@noble/hashes`. The `await crypto.subtle` native path has NO such wiring (preferred). Pin the exact version in a comment next to the vendored file.
**Warning signs:** "sha512 not set" / "expected Uint8Array."

### Pitfall 3: Canonicalizing the wrong byte string (signature scope ambiguity)
**What goes wrong:** Signing/verifying over the full envelope (including the `signature` field) makes verification self-referential and always fail; or signing over `JSON.stringify(recipe)` (insertion-order-dependent) makes a re-serialized recipe verify-fail.
**Why it happens:** "Recipe integrity metadata travels with the recipe" (SIGN-02) leaves the exact signed-field set to the planner.
**How to avoid:** Define the signed payload precisely: the recipe core fields **including** `capturedAt` and `schemaHash`, **excluding** the `signature` field itself; canonicalize via the in-house JCS serializer (Pattern 2) before verify. Document this in the fixture and the LEGAL/SIGN comment.
**Warning signs:** A freshly-signed fixture verifies, but the same recipe round-tripped through `JSON.parse`/re-stringify does not.

### Pitfall 4: CONSENT_* codes collapsing to `action_rejected` at the MCP layer
**What goes wrong:** A bare `CONSENT_REQUIRED` with only `code`/`errorCode` set but matching neither `FSB_ERROR_MESSAGES`, `CODE_ONLY_ERROR_KEYS`, nor the `/^(TRIGGER_.+|RECIPE_.+|...)$/` passthrough regex falls through `resolveErrorKey` to `action_rejected` — losing the typed reason.
**Why it happens:** `errors.ts:137` passthrough currently matches `RECIPE_.+` and `TRIGGER_.+` but NOT `CONSENT_.+`. `[VERIFIED: mcp/src/errors.ts:137]`
**How to avoid — two compliant options (planner picks; D-03 says "no schema break"):**
  - **(A) Name them in the `RECIPE_` family** — e.g. `RECIPE_CONSENT_REQUIRED`, `RECIPE_CONSENT_BLOCKED`, `RECIPE_CONSENT_MUTATING_REQUIRED`. These match `/^RECIPE_.+$/` **today** and surface verbatim with **zero** `errors.ts` change — strictly INV-01-safe.
  - **(B) Add `CONSENT_*` to the passthrough regex / `CODE_ONLY_ERROR_KEYS`** — a one-line additive change to `errors.ts` (like `RECOVERY_AMBIGUOUS` was added). This is NOT an MCP tool-schema change (INV-01 is about the ~63 tool schemas + wire), but it IS an `errors.ts` edit, which D-03 says to avoid if possible.
  **Recommendation:** Option (A) — reuse the `RECIPE_` family so the codes surface verbatim with no `errors.ts` edit at all. It is the most literal reading of D-03/D-06 ("surfaces verbatim — no errors.ts edit") and reuses the exact `createRecipeError` helper already in `capability-interpreter.js`.
**Warning signs:** The MCP host shows "Detected: Page navigation / action_rejected" instead of the consent reason.

### Pitfall 5: Recipe-path guard Check 4 fails closed on an un-allowlisted `capability-*.js`
**What goes wrong:** Naming the signature module `capability-signature.js` (recommended, so the glob covers it) without adding it to `RECIPE_PATH_ALLOWLIST` makes Check 4 fail the build immediately — `extension/utils/capability-*.js` on disk MUST be on the allowlist.
**Why it happens:** Check 4 enumerates `extension/utils/capability-*.js` from disk and fails on any absent from the hardcoded list (`bypass-by-omission` guard). `[VERIFIED: verify-recipe-path-guard.mjs:296-329]`
**How to avoid:** Add the module to `RECIPE_PATH_ALLOWLIST` in the SAME plan that creates it (the Phase 27/28/29 pre-arm precedent). If the module is instead named `recipe-signature.js` (NOT matching `capability-*`), Check 4 won't auto-flag it, but it is still on the interpret path and MUST be allowlisted manually + kept eval-free (Check 1). **Recommendation:** name it `capability-signature.js` so the disk-glob makes the allowlist requirement self-enforcing.
**Warning signs:** `verify-recipe-path-guard: FAIL ... 'extension/utils/capability-signature.js' exists on disk but is NOT on the recipe-path allowlist`.

### Pitfall 6: `consent-policy-store.js` / `audit-log.js` are NOT named `capability-*` — silent non-scan
**What goes wrong:** These two modules are reached during the invoke gate (not the interpret path per se), but if a future maintainer routes recipe data through them and they are NOT allowlisted, they are never eval-scanned.
**Why it happens:** Check 4 only globs `capability-*.js`; `consent-policy-store.js`/`audit-log.js` don't match.
**How to avoid:** Add BOTH to `RECIPE_PATH_ALLOWLIST` explicitly (Check 1 then greps them for eval/new Function/import). CONTEXT D-57-discretion already anticipates this ("any that sit on the recipe/interpret path MUST be eval-free + allowlisted"). Keeping them allowlisted is cheap insurance and matches the gate's position directly above the interpret path.
**Warning signs:** A reviewer asks "is the consent store eval-scanned?" and the answer is "no."

### Pitfall 7: chrome.storage write races corrupting the append-only audit ring
**What goes wrong:** Two near-simultaneous invokes both `get` the ring, both `push`, both `set` — the second clobbers the first's entry.
**Why it happens:** `chrome.storage.local` get/set is async and not transactional; the diagnostics ring uses an in-memory shadow precisely to mitigate this.
**How to avoid:** Clone the diagnostics-ring's in-memory `_inMemoryRing` shadow + reconcile-on-write pattern (`diagnostics-ring-buffer.js:39-64`). For the consent store, follow `agent-registry.js`'s `withRegistryLock` 4-line promise-chain mutex if concurrent writes are possible. The single-threaded SW limits true concurrency, but the shadow is still load-bearing for ordering.
**Warning signs:** Audit entries occasionally missing under load; export shows fewer entries than invokes.

## Code Examples

### Cloning the audit ring (entry schema D-10, redaction D-11)
```javascript
// Source: diagnostics-ring-buffer.js:27-65 (clone) + redactForLog.js:29-63 (reuse)
// audit-log.js -- append-only redacted ring. NEVER persists args/bodies/headers.
function appendAuditEntry(entry) {
  if (!entry || typeof entry !== 'object') return Promise.resolve();
  var redact = (typeof globalThis !== 'undefined' && globalThis.redactForLog) ? globalThis.redactForLog : null;
  // Field WHITELIST (D-10) -- args/body/cookie/token/csrf are not even read here.
  var safe = {
    ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
    origin: entry.origin ? (redact ? redact(entry.origin).origin || '' : '') : '',  // URL->origin only
    slug: String(entry.slug || ''),
    method: String(entry.method || ''),
    sideEffectClass: String(entry.sideEffectClass || 'read'),
    consentDecision: String(entry.consentDecision || ''),
    outcome: String(entry.outcome || ''),
    error: entry.error ? (redact ? redact(entry.error).message || '' : '') : undefined // error name/message only
  };
  // ... identical FIFO trim + in-memory shadow + chrome.storage.local.set as diagnostics ring ...
}
```

### Default-OFF consent envelope (D-02)
```javascript
// Source: agent-registry.js:91-120 (versioned-envelope read/write clone)
var FSB_CONSENT_STORAGE_KEY = 'fsbConsentPolicies';
var FSB_CONSENT_PAYLOAD_VERSION = 1;
// Envelope: { v:1, defaultMode:'off', policies: { 'https://github.com': { mode:'auto', mutating:false } } }
function getConsentForOrigin(envelope, origin) {
  var policies = (envelope && envelope.policies) || {};
  var p = Object.prototype.hasOwnProperty.call(policies, origin) ? policies[origin] : null;
  return {
    mode: (p && p.mode) || (envelope && envelope.defaultMode) || 'off',   // DEFAULT OFF (GOV-01)
    mutating: !!(p && p.mutating)                                          // elevated opt-in (GOV-03)
  };
}
```

### Service denylist checked BEFORE policy (D-15)
```javascript
// Source: extension/config/service-denylist.json shape + D-15 ordering
// { "v": 1, "deniedOrigins": ["https://*.chase.com", "https://mail.google.com"],
//   "deniedReason": "Automation prohibited for this service category." }
// In the gate, denylist is consulted FIRST -- a denylisted origin is non-enableable
// (UI greys it; gate returns RECIPE_CONSENT_BLOCKED) regardless of any stored policy.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ed25519 only via JS libs (tweetnacl/noble) in browsers | Native `crypto.subtle` Ed25519 unprefixed | Chrome 137 / Safari 17 / Firefox 129 | Verify needs no bundled crypto on modern Chrome; fallback is a contingency, not the baseline. `[CITED: caniuse.com]` |
| `@noble/ed25519` v2 `ed.etc.sha512Sync` wiring | v3 `ed.hashes.sha512` | noble v3 (3.1.0, Apr 2026) | Fallback wiring changed; pin the version. `[CITED: noble releases]` |
| Ad-hoc JSON sorting for signatures | RFC 8785 JCS (UTF-16 code-unit key order) | RFC 8785 (2020) | Deterministic canonical form; for closed shapes the in-house serializer is sufficient. `[CITED: rfc-editor.org/rfc8785]` |

**Deprecated/outdated:**
- Web Crypto Ed25519 behind the "Experimental Web Platform Features" flag — superseded by the unprefixed Chrome 137 ship. Do NOT instruct users to enable any flag.
- noble v1/v2 API tutorials — the v3 SHA-512 wiring differs (Pitfall 2).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@noble/ed25519` is the right eval-free fallback (verify path, ~3.9KB gz, self-audited 2026-03; v1 cure53-audited) | Standard Stack / fallback | LOW — discovered via WebSearch, npm-confirmed 3.1.0/0-deps; planner must run `checkpoint:human-verify` before vendoring (slopcheck unavailable). If wrong, native path is unaffected. |
| A2 | `@noble/hashes` sha512 is the SHA-512 source for noble sync verify | Standard Stack | LOW — only matters if the noble sync fallback is adopted; native path needs no hash wiring. |
| A3 | The signed payload = recipe core incl. capturedAt+schemaHash, excl. signature field | Pitfall 3 / Pattern 2 | MEDIUM — exact signed-field set is a planner decision; a fixture proves whichever is chosen. Wrong scope = verify always fails or is tamper-blind. |
| A4 | Naming the module `capability-signature.js` (so Check 4 auto-covers it) is preferred over `recipe-signature.js` | Module Placement / Pitfall 5 | LOW — either name works if allowlisted; `capability-*` makes the requirement self-enforcing. CONTEXT D-05 used `recipe-signature.js` as the illustrative name (discretion explicitly allows the placement choice). |
| A5 | Option (A) `RECIPE_CONSENT_*` naming surfaces verbatim with zero errors.ts edit | Pitfall 4 | LOW — verified against the live `/^RECIPE_.+$/` passthrough (errors.ts:137). The codes are the planner's to name (D-03 discretion). |
| A6 | The closed recipe vocabulary will not gain floats/non-BMP keys this phase | Pattern 2 (in-house JCS) | LOW — schema is locked (capability-recipe-schema.js); the canonicalizer's `throw` is a tripwire if it ever changes. |

## Open Questions

1. **Exact signed-field set for the recipe signature (the JCS input).**
   - What we know: SIGN-02 says signature + captured-at + schema-hash travel with the recipe; verify happens before bind.
   - What's unclear: precisely which fields are inside the signature envelope.
   - Recommendation: sign the recipe core fields **plus** `capturedAt` and `schemaHash`, **minus** the `signature` field; canonicalize via the in-house JCS serializer. Lock this in the Plan and prove it with the fixture keypair (sign → pass; flip one byte of any signed field → `RECIPE_SIGNATURE_INVALID`). This is a planner decision, not a research gap.

2. **Whether to bundle the noble fallback at all (decision criteria).**
   - What we know: native Ed25519 is Chrome 137+; FSB sets no `minimum_chrome_version`.
   - What's unclear: the real-world minimum Chrome FSB must support.
   - Recommendation / decision criteria:
     - **Bundle the fallback IF** FSB's supported floor is below Chrome 137, OR the team wants verify to work on the broadest possible Chromium/Brave/Edge range, OR a `checkpoint:human-verify` confirms an analytics tail of pre-137 users.
     - **Skip the fallback (native-only) IF** the team is willing to require Chrome 137+ for the (Phase-31) signed-recipe path specifically — note that bundled recipes are exempt (D-07), so native-only Ed25519 would only gate the *non-bundled* path that does not ship until Phase 31. This makes native-only a defensible Phase-30 choice: the verify code path is exercised on a fixture today, and the fallback can be added in Phase 31 if telemetry warrants. **Lean recommendation: native-first with the feature-detect now; defer bundling the noble fallback to Phase 31 unless a pre-137 floor is confirmed** — this keeps Phase 30's supply-chain surface at zero new packages while still proving the path on the fixture.

3. **Sensitive-origin heuristic thresholds (D-14).**
   - What we know: banking/email/government categories force Ask/confirm even under Auto.
   - What's unclear: the exact match rules (host suffix list vs. keyword heuristics).
   - Recommendation: a small curated host-pattern list seeded alongside the denylist (e.g. `*.bank`, known primary-email hosts, `*.gov`), kept conservative and user-visible; the UI flags matches with the amber `Sensitive` badge. Planner's discretion within the UI-SPEC color contract.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (test harness) | All headless tests | ✓ | (repo standard) | — |
| `crypto.subtle` Ed25519 in Node (for tests) | Signature-verify tests (sign fixture + verify) | ✓ | Node ≥ 16 `globalThis.crypto.webcrypto` supports Ed25519 | noble lib in test if ever absent |
| `npm --prefix mcp run build` | The errors.ts passthrough assertion (built module) | ✓ | already in the `test` chain | — |
| `@cfworker/json-schema` (vendored) | Schema-validate precedes the verify hook | ✓ | `extension/lib/cfworker-json-schema.min.js` | — |
| Native Web Crypto Ed25519 (Chrome runtime) | Production signature verify | ✓ on Chrome 137+ | n/a (browser) | bundled `@noble/ed25519` (contingency) |

**Missing dependencies with no fallback:** none for Phase 30 (verify path is exercised on a fixture; bundled recipes are exempt).
**Missing dependencies with fallback:** pre-Chrome-137 native Ed25519 → bundled noble verify (only if the floor demands it; see Open Question 2).

**Test-harness note:** Node's `globalThis.crypto.subtle` natively supports `generateKey`/`sign`/`verify` for Ed25519 (Node ≥ 16), so the fixture-keypair test (sign a fixture recipe → verify-pass; tamper → `RECIPE_SIGNATURE_INVALID`) can run **zero-framework in plain Node** with no chrome stub for crypto — the same way `capability-fetch.test.js` runs `capabilityFetchInPage` directly. The chrome stubs are only needed for the storage (consent/audit) tests, cloned from `diagnostics-ring-buffer.test.js`'s in-memory `chrome.storage.local` stub.

## Validation Architecture

> nyquist_validation: config has no `workflow.nyquist_validation` key → treated as ENABLED. This section is included and drives VALIDATION.md.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Zero-framework FSB convention: `passed/failed` counters + synchronous `check(cond,msg)` / `ok(cond,msg)` + `process.exit(failed>0?1:0)` |
| Config file | none — tests are standalone Node scripts wired into the `npm test` chain in `package.json:17` |
| Quick run command | `node tests/<name>.test.js` (single file, < 5s each) |
| Full suite command | `npm test` (the long `&&` chain) — new tests appended at the tail next to `capability-*.test.js` |
| Chrome stub source | in-memory `chrome.storage.local` stub per `diagnostics-ring-buffer.test.js`; recipe loader (cfworker via `vm.runInThisContext`) per `capability-fetch.test.js`/`capability-interpreter.test.js` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GOV-01 | New/unseen origin is default-OFF → `invoke` returns `RECIPE_CONSENT_REQUIRED`, no side effect | unit | `node tests/consent-gate.test.js` | ❌ Wave 0 |
| GOV-02 | Off/Ask/Auto round-trip in the store; Auto is per-origin (no global enable) | unit | `node tests/consent-policy-store.test.js` | ❌ Wave 0 |
| GOV-03 | Read-Auto does NOT imply write-Auto: a POST on a read-Auto origin returns `RECIPE_CONSENT_MUTATING_REQUIRED`; elevated opt-in lets it through | unit | `node tests/consent-mutation-gate.test.js` | ❌ Wave 0 |
| GOV-04 | Gate runs at the single `invoke` chokepoint, AFTER ownership (ownership-denied never reaches consent); both front doors hit it | unit | `node tests/consent-chokepoint.test.js` (assert one gate; parity with `capability-autopilot-parity.test.js` style) | ❌ Wave 0 |
| GOV-05 | Append-only entry has exactly `{ts,origin,slug,method,sideEffectClass,consentDecision,outcome,error?}` and FIFO-trims | unit | `node tests/audit-log.test.js` | ❌ Wave 0 |
| GOV-06 | NO auth substring (`cookie`/`token`/`csrf`/`xoxc`/`_gh_sess`/`bearer`/`authorization`) survives in the persisted ring or in capture | unit (security) | `node tests/audit-log-no-secret.test.js` | ❌ Wave 0 |
| GOV-07 | Control-panel section surface shape (nav, per-origin list, pending queue, audit table, legal card) + options.js wiring | source-text unit | `node tests/consent-audit-settings-ui.test.js` (the `change-report-settings-ui.test.js` style; AC list in 30-UI-SPEC.md) | ❌ Wave 0 |
| GOV-08 | `docs/LEGAL.md` exists with retention+consent sections; `service-denylist.json` valid shape; denylist checked BEFORE policy (denylisted origin non-enableable) | unit + source | `node tests/service-denylist.test.js` (+ a LEGAL.md presence assert) | ❌ Wave 0 |
| SIGN-01 | FIXTURE KEYPAIR: sign a fixture recipe → verify-pass; flip one signed byte → `RECIPE_SIGNATURE_INVALID`; absent signature on non-bundled → reject | unit (security) | `node tests/recipe-signature.test.js` | ❌ Wave 0 |
| SIGN-02 | Verify hook fires INSIDE `interpretRecipe` AFTER schema-validate, BEFORE bind; integrity metadata (sig/capturedAt/schemaHash) is the verified payload | unit | `node tests/recipe-signature-interpreter-hook.test.js` (or fold into `capability-interpreter.test.js`) | ❌ Wave 0 |
| D-07 | Bundled-provenance recipe is EXEMPT (verify NOT called); non-bundled IS gated | unit | covered in `tests/recipe-signature.test.js` (provenance branch) | ❌ Wave 0 |
| INV-01/04 regression | errors.ts passthrough surfaces `RECIPE_CONSENT_*`/`RECIPE_SIGNATURE_INVALID` verbatim (built mcp module); iterator byte-untouched; ~63 tool schemas unchanged | unit | reuse `tests/capability-interpreter.test.js` passthrough idiom + `tests/agent-loop-iterator-guard.test.js` | partial (extend) |

### Sampling Rate
- **Per task commit:** the single new test for the module touched (e.g. `node tests/consent-gate.test.js`).
- **Per wave merge:** all new Phase-30 tests + the recipe-path guard (`node scripts/verify-recipe-path-guard.mjs`) + the iterator guard.
- **Phase gate:** full `npm test` green before `/gsd:verify-work`, plus `npm run validate:extension` (which runs the recipe-path guard).

### Wave 0 Gaps
- [ ] `tests/consent-policy-store.test.js` — GOV-02 (envelope round-trip, default-OFF)
- [ ] `tests/consent-gate.test.js` — GOV-01 (default-OFF blocks; chokepoint placement)
- [ ] `tests/consent-mutation-gate.test.js` — GOV-03 (read-Auto ≠ write-Auto)
- [ ] `tests/consent-chokepoint.test.js` — GOV-04 (one gate; after ownership; both doors)
- [ ] `tests/audit-log.test.js` — GOV-05 (entry schema + FIFO)
- [ ] `tests/audit-log-no-secret.test.js` — GOV-06 (no-auth-substring; the security assertion)
- [ ] `tests/recipe-signature.test.js` — SIGN-01 + D-07 (fixture keypair sign/verify/tamper + provenance exemption)
- [ ] `tests/recipe-signature-interpreter-hook.test.js` — SIGN-02 (hook order in interpretRecipe)
- [ ] `tests/service-denylist.test.js` — GOV-08 (denylist shape + checked-first)
- [ ] `tests/consent-audit-settings-ui.test.js` — GOV-07 (UI surface per 30-UI-SPEC AC)
- [ ] Fixtures: `catalog/recipes/_fixtures/` signed + tampered recipe + a fixture Ed25519 public key (D-08)
- [ ] Wire all of the above into `package.json:17` `test` chain (tail, next to `capability-*.test.js`)
- [ ] Pre-arm `RECIPE_PATH_ALLOWLIST` with `capability-signature.js` + `consent-policy-store.js` + `audit-log.js` in the same wave (Check 4 fails closed otherwise)

**Live-only / human_needed:** Only a manual UI smoke of the Consent & Audit section (visual render, Grant/Deny click, badge appearance) is genuinely live-only — flag as `human_needed` (a short manual control-panel smoke), mirroring how Phase 27/28/29 closed their live halves. Everything else (consent logic, signature verify, audit redaction, denylist, UI surface shape) is headless-testable.

## Security Domain

> This phase IS the security phase. `security_enforcement` not set to `false` → ENABLED. Stack: MV3 service worker (JS), Web Crypto, chrome.storage.local, vanilla options-page UI.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Single chokepoint (defense-in-depth); gate above origin-pin; one engine both doors (INV-02). |
| V2 Authentication | partial | The "authentication" here is the user's first-party session (cookies stay in MAIN world, never read by the gate). The consent gate is the authorization layer on top. Auth material never touches the audit log (GOV-06). |
| V3 Session Management | partial | Consent state persisted in a versioned chrome.storage.local envelope; survives SW eviction; default-OFF on any unknown origin. Pending-Ask records are short-lived and carry no secrets. |
| V4 Access Control | **yes (core)** | Default-deny per origin (GOV-01); explicit per-origin Off/Ask/Auto (GOV-02); separate elevated grant for mutations (GOV-03); enforced at the single dispatch chokepoint after ownership (GOV-04); denylist as a hard non-enableable deny checked first (GOV-08); sensitive-origin friction even under Auto (GOV-07/D-14). |
| V5 Input Validation | yes | Recipe schema (closed vocabulary, `@cfworker/json-schema`) runs BEFORE the verify hook; origin-pin re-asserted post-query-fold (Phase 27, still holds); JCS canonicalizer throws on out-of-vocabulary numbers. |
| V6 Cryptography | **yes (core)** | Ed25519 verify via native `crypto.subtle` (constant-time, audited) with an audited pure-JS fallback (`@noble/ed25519`); NEVER hand-rolled. JCS (RFC 8785) deterministic canonicalization prevents signature-malleability via re-serialization. Public key bundled; private key offline (Phase 31). Verify fails CLOSED. |
| V7 Logging & Error Handling | **yes (core)** | Append-only audit log records decision/outcome but NEVER secrets (GOV-05); triple-enforced (schema whitelist D-10 + `redactForLog` D-11 + no-auth-substring test). Typed errors surface verbatim without leaking internals; the UI also asserts no secret column exists (UI-SPEC AC). |
| V8 Data Protection | yes | Audit log is secret-free by construction (no encryption needed, D-12); export is the redacted ring only; retention is a bounded ring + user export-&-clear, documented in LEGAL.md. |
| V12 Files/Resources | yes | Service denylist + bundled public key are static bundled config; no remotely-hosted code or keys (Wall-1). |
| V14 Configuration | yes | `action` permission already present (badge); no new manifest permission required; recipe-path CI guard keeps the new modules eval-free. |

### Known Threat Patterns for the MV3 consent/verify stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged/tampered server recipe executes a credentialed call | **T**ampering / **E**levation | Ed25519 verify over JCS canonical form before bind; tamper → `RECIPE_SIGNATURE_INVALID`; non-bundled provenance is gated, bundled is trusted-by-review (D-07). |
| Signature malleability via JSON re-serialization (key reorder / whitespace) | **T**ampering | RFC 8785 JCS canonicalization (deterministic byte string) before sign/verify; the in-house serializer's UTF-16 key sort + integer-only number rule. |
| Silent "assume valid" when Web Crypto Ed25519 is absent | **S**poofing / **E**levation | Fail CLOSED: missing verifier → `false` → reject; feature-detect + (optional) bundled fallback; never default to "valid." |
| Credential replay against an origin the user never approved | **E**levation of privilege | Default-OFF per origin (GOV-01); nothing runs until explicit enable; Auto is per-origin opt-in, never global (GOV-02). |
| Unintended state-changing (mutating) call under read consent | **T**ampering / **E**levation | Separate elevated mutating opt-in (GOV-03/D-04); `MUTATING_METHODS` classifier; mutating always surfaces in Ask + disambiguates. |
| Bypassing the gate via the autopilot front door | **E**levation | One gate wrapping the single `invoke` chokepoint (INV-02); both doors verified to pass `{origin}` and reach the same gate; no parallel path. |
| Secret leakage into logs (cookies/tokens/CSRF in the audit trail) | **I**nformation disclosure | Field-whitelist schema (D-10) + `redactForLog` (D-11) + no-auth-substring test (GOV-06) + UI no-secret-column assertion. |
| Automating a prohibited service (bank/gov/primary email) | **E**levation / legal | Service denylist checked BEFORE policy, non-enableable (GOV-08/D-15/D-16); sensitive-origin classifier forces friction even under Auto (D-14). |
| Pending-Ask record used to smuggle data or grant cross-origin | **T**ampering / **E**levation | Pending record carries only `{origin, slug, method, sideEffectClass, ts}` (no args/secrets); grant writes consent for that exact origin/scope only; origin-pin still enforced downstream. |
| Reintroducing dynamic code on the recipe path (the new crypto/storage modules) | **T**ampering | Recipe-path CI guard Check 1/4 — `capability-signature.js`/`consent-policy-store.js`/`audit-log.js` allowlisted + eval-scanned; build reds on any `eval`/`new Function`/`import(`. |
| Storage write race corrupting the append-only audit ring | **R**epudiation | In-memory shadow + reconcile-on-write (diagnostics-ring pattern); single-threaded SW; optional `withRegistryLock` mutex for the consent store. |

## Sources

### Primary (HIGH confidence)
- In-repo verified source anchors: `extension/utils/capability-router.js:182-216`, `capability-interpreter.js:85-93/124/236-385`, `capability-recipe-schema.js:79-148`, `capability-fetch.js:228`, `redactForLog.js:29-63`, `diagnostics-ring-buffer.js:1-122`, `agent-registry.js:80-120`, `mcp/src/errors.ts:54-72/137`, `scripts/verify-recipe-path-guard.mjs:90-130/296-368`, `extension/manifest.json`, `extension/ws/mcp-tool-dispatcher.js:2208-2236`, `extension/ai/tool-executor.js:672-716`, `tests/change-report-settings-ui.test.js`, `package.json:17`, `catalog/recipes/github-notifications.json`, `.planning/phases/30-.../30-CONTEXT.md`, `.../30-UI-SPEC.md`, `.planning/REQUIREMENTS.md:43-79`, `.planning/ROADMAP.md:14-108`.
- caniuse.com — `mdn-api_subtlecrypto_verify_ed25519` — Chrome 137, Safari 17, Firefox 129 first-support.
- MDN — SubtleCrypto.verify / importKey / sign — Ed25519 `{name:'Ed25519'}` API, available in Web Workers.
- npm registry (`npm view`, 2026-06-21) — `@noble/ed25519@3.1.0` (0 deps), `@noble/hashes@2.2.0`, `canonicalize@3.0.0`.

### Secondary (MEDIUM confidence)
- github.com/paulmillr/noble-ed25519 (README + releases) — v3 sync verify API (`ed.hashes.sha512`), `verify(signature, message, publicKey)`, `zip215:false` strict mode, eval-free, ~3.9KB gz, v1 cure53-audited 2022 / 2026-03 self-audit.
- rfc-editor.org/rfc8785 + datatracker RFC 8785 — JCS key sort = UTF-16 code-unit order (maps to ECMAScript string + default `Array.sort`).

### Tertiary (LOW confidence — flagged for human verify before vendoring)
- developer.chrome.com chrome.action — `setBadgeText`/`setBadgeBackgroundColor` SW-callable with `action` key (cross-checked against existing in-repo usage, so effectively HIGH).
- Package legitimacy: slopcheck UNAVAILABLE this session — `@noble/ed25519` / `@noble/hashes` carry a mandatory `checkpoint:human-verify` before vendoring.

## Metadata

**Confidence breakdown:**
- Standard stack (reuse map): HIGH — every reused asset verified by reading the in-repo source.
- Architecture (gate placement, signature hook, audit ring): HIGH — chokepoint, hook point, and front-door ctx all verified in source.
- Ed25519 / Chrome version: HIGH — caniuse + MDN authoritative; manifest floor verified absent.
- JCS recommendation: HIGH — driven by the verified closed-vocabulary schema; RFC 8785 key-sort rule cited.
- noble fallback specifics: MEDIUM — npm-confirmed versions; slopcheck unavailable so flagged for human verify.
- Pitfalls / threats: HIGH — derived from verified source + cited external behavior.

**Research date:** 2026-06-21
**Valid until:** ~2026-07-21 (30 days; Web Crypto Ed25519 support and the recipe schema are stable; re-verify noble version if vendoring is deferred to Phase 31).

## RESEARCH COMPLETE

**Phase:** 30 - Consent Governance + Recipe Signature Verification + Audit + Legal Posture
**Confidence:** HIGH

### Key Findings
- **Ed25519 via Web Crypto shipped in Chrome 137** (Safari 17, Firefox 129); the FSB manifest sets NO `minimum_chrome_version`, so a runtime feature-detect is mandatory. Recommend native-first verify with a bundled `@noble/ed25519` fallback whose adoption is gated by the supported-Chrome floor (lean: native-only for Phase 30 since the non-bundled path it gates ships in Phase 31; bundled recipes are exempt by provenance).
- **JCS: build a focused ~40-line in-house serializer, not a dependency.** The recipe vocabulary is closed/shallow/all-string-enum-const-int, so RFC 8785's hard cases (float serialization, surrogate-pair key sorting) cannot arise; JS default `Array.sort` already gives the required UTF-16 code-unit key order.
- **Consent "Ask" out-of-band flow is fully de-risked:** both front doors already resolve `{origin, tabId, source}` before `invoke`, and `chrome.action.setBadgeText` is already used across the SW today — typed `CONSENT_REQUIRED` return + chrome.storage.local pending record + badge needs no new permission.
- **Name the signature module `capability-signature.js`** so the recipe-path guard's Check-4 `capability-*` disk-glob makes the allowlist requirement self-enforcing; allowlist `consent-policy-store.js` + `audit-log.js` too. Use `RECIPE_CONSENT_*` codes so they surface verbatim with ZERO `errors.ts` edit (the `/^RECIPE_.+$/` passthrough already matches).
- Audit ring = clone `diagnostics-ring-buffer.js`; consent store = clone `agent-registry.js` envelope; redaction = reuse `redactForLog`; UI = mirror Phase-245 change-report EXACTLY. The crypto is the only net-new capability; everything else is assembly of proven in-repo patterns.

### File Created
`.planning/phases/30-consent-governance-recipe-signature-verification-audit-legal/30-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Every reused asset read + verified in source; new packages npm-confirmed. |
| Architecture | HIGH | Chokepoint, interpreter hook point, and both front-door ctx shapes verified. |
| Pitfalls | HIGH | Derived from verified source + cited Chrome/noble/RFC behavior. |

### Open Questions
1. Exact signed-field set for the recipe signature (planner decision; prove with fixture).
2. Whether to bundle the noble fallback now vs. defer to Phase 31 (decision criteria given; lean = defer unless a pre-137 floor is confirmed).
3. Sensitive-origin heuristic thresholds (planner discretion within UI-SPEC color contract).

### Ready for Planning
Research complete. The planner can create PLAN.md files: Wave 0 validation contract (11 new tests + fixtures + allowlist pre-arm), then the three new modules, the two modified seams (router gate + interpreter hook), the denylist + LEGAL.md, and the Consent & Audit UI per 30-UI-SPEC.md.
