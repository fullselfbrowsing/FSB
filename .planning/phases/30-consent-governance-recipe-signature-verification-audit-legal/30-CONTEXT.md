# Phase 30: Consent Governance + Recipe Signature Verification + Audit + Legal Posture - Context

**Gathered:** 2026-06-21 (smart discuss — autonomous mode; all 4 areas accepted as recommended)
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap the Phase-29 capability `invoke` in the safety gate the whole **credential-replay** risk class hinges on, BEFORE any learning/auto behavior ships (Phase 31+):
- **Default-OFF per-origin consent** (Off / Ask / Auto) enforced at the single dispatch chokepoint (GOV-01..04).
- **Mutation gating** — elevated, separate consent for POST/PUT/PATCH/DELETE (GOV-03).
- **Recipe signature verification** (Ed25519/JCS) checked by the interpreter before binding (SIGN-01, SIGN-02).
- **No-secrets append-only audit log** + a tested redactor (GOV-05, GOV-06).
- **Control-panel UI** for per-origin consent + audit viewing, with sensitive-origin friction (GOV-07).
- **Documented legal/ToS posture + service denylist** (GOV-08).

**In scope (GOV-01..08, SIGN-01..02).**

**Explicitly NOT in this phase:**
- Real **server-delivered / learned recipe signing** (the private-key signer + promotion pipeline) — that is **Phase 31**. Phase 30 ships the VERIFY path + a fixture keypair; first-party bundled recipes are exempt-by-provenance (D-07).
- Network-capture discovery / recipe synthesis (Phase 31) and self-healing / recipe-rot (Phase 32).
- Phase 29's router/catalog/head are DONE; this phase only WRAPS `invoke` and adds the interpreter signature hook — it does not re-architect the engine.
</domain>

<decisions>
## Implementation Decisions

### Consent Model & Enforcement (GOV-01, GOV-02, GOV-03, GOV-04)
- **D-01:** The consent gate is a **wrapper around `FsbCapabilityRouter.invoke`** (`extension/utils/capability-router.js:182`) — the single chokepoint BOTH front doors reach (MCP dispatcher `mcp-tool-dispatcher.js:2208-2236` and autopilot `tool-executor.js:672-716`) — enforced **after the existing ownership gate** (agent-registry / `ownership-error-codes`). One gate, both doors (mirrors the Phase-29 INV-02 "one engine" principle). No second/parallel gate per front door.
- **D-02:** Per-origin consent lives in a **NEW `extension/utils/consent-policy-store.js`** over `chrome.storage.local` as a **versioned envelope** (`{ v, policies: { [origin]: { mode } }, defaultMode }`, mirroring `agent-registry.js` / `diagnostics-ring-buffer.js` storage patterns). **Default is OFF per origin** — nothing runs against an origin until the user explicitly enables it (GOV-01). Auto is an explicit per-origin opt-in, never a global switch (GOV-02).
- **D-03:** **"Ask" mode** returns a typed **`CONSENT_REQUIRED`** error (dual-field `/^RECIPE_.+$/`-style or a `CONSENT_*` family that surfaces verbatim) at invoke time — NOT a blocking in-page modal mid-invoke (there is no synchronous user prompt during an MCP/autopilot call). The pending request is surfaced out-of-band (control-panel + a badge/notice) for the user to grant; once granted, the caller may retry. (Planner names the exact `CONSENT_*` codes; they must surface through the existing error passthrough without an `errors.ts` schema break.)
- **D-04:** **Mutation gating (GOV-03):** side-effect class is derived from `MUTATING_METHODS` (`capability-fetch.js:228`) + the handler/recipe `sideEffectClass`. **Mutating invokes require a SEPARATE elevated per-origin opt-in** — read-Auto does NOT imply write-Auto. Mutating calls always surface in the Ask prompt and trigger disambiguation before any mutating invoke.

### Recipe Signature Verification (SIGN-01, SIGN-02)
- **D-05:** SIGN-01 names "Ed25519/JCS via Lattice receipts," but the Lattice modules are runtime/step-coordination with **no cryptographic primitive**. Realize it with a **NEW pure `extension/utils/recipe-signature.js`** using **Web Crypto `crypto.subtle` Ed25519** over the **JCS (RFC 8785) canonical form** of the recipe JSON. "Lattice receipt" is interpreted as the **provenance-envelope shape** (signature + captured-at + schema-hash), with the actual verify done via Web Crypto. Eval-free; joins `RECIPE_PATH_ALLOWLIST` if placed under `extension/utils/capability-*`-adjacent guard scope.
- **D-06:** Verification is enforced **inside `interpretRecipe`** (`extension/utils/capability-interpreter.js:124`) **AFTER schema validation, BEFORE binding** (SIGN-02). An unverified or tampered recipe is rejected with a typed **`RECIPE_SIGNATURE_INVALID`** reason (matches `/^RECIPE_.+$/`, dual-field via `createRecipeError`, surfaces verbatim — no `errors.ts` edit).
- **D-07:** Signature verification is **REQUIRED only for recipes of non-bundled provenance** (server-delivered / learned — Phase 31). **First-party bundled recipes** (Phase 29's `catalog/recipes/*.json` + handlers, Wall-1 reviewed) are **trusted-by-provenance and exempt** from the verify gate, BUT they carry the SIGN-02 integrity metadata (signature, captured-at, schema hash) so the path is exercised on a fixture. A `provenance` field on the catalog entry / recipe distinguishes `bundled` vs `server`/`learned`.
- **D-08:** The **trusted public key(s) ship in the extension bundle** (config). The private signing key is offline/CI (recipes get signed at publish time — Phase 31). Phase 30 ships the verify path + a **fixture keypair** for tests (sign a fixture recipe, assert verify-pass; tamper it, assert `RECIPE_SIGNATURE_INVALID`).

### Audit Log & Redaction (GOV-05, GOV-06)
- **D-09:** A **NEW `extension/utils/audit-log.js`** over `chrome.storage.local` as an **append-only versioned envelope** `{ v, entries: [...] }` (mirrors `diagnostics-ring-buffer.js`), **bounded** (ring) with an archival/export hook.
- **D-10:** **Entry schema (GOV-05):** `{ ts, origin, slug, method, sideEffectClass, consentDecision, outcome, error? }`. It records origin, capability, method, side-effect class, consent decision, outcome, and timestamp — and **NEVER** args, tokens, cookies, CSRF, or response bodies.
- **D-11:** **Redaction (GOV-06):** every field passes through the existing **`redactForLog`** (`extension/utils/redactForLog.js:29-63`, shape-only) before persistence. A new test asserts **no auth substring** (cookie/token/CSRF/`xoxc`/`_gh_sess`/bearer) survives in the persisted audit log or in capture. Auth material never leaves the device and is never persisted.
- **D-12:** **Retention:** bounded ring + a user **"export & clear"** control (like the diagnostics ring's export). The retention policy is documented in `docs/LEGAL.md`.

### Control-Panel UI & Legal Posture (GOV-07, GOV-08)
- **D-13:** A **NEW "Consent & Audit" section in `extension/ui/control_panel.html`** (add a `data-section` to the nav at `:54+`) wired through **`extension/ui/options.js`** (`defaultSettings` + cacheElements + listeners), following the **Phase-245 change-report toggle pattern** (`fsbChangeReportsEnabled`, tested in `tests/change-report-settings-ui.test.js`) EXACTLY. It shows a per-origin consent list (Off/Ask/Auto, with the elevated mutating opt-in) and the audit-log viewer (+ export/clear).
- **D-14:** A **sensitive-origin classifier** (banking / email / government heuristics + the denylist) forces **Ask / extra confirmation EVEN under Auto**, and visually flags those origins in the UI (GOV-07 "sensitive origins carry extra friction even under Auto").
- **D-15:** **Legal posture (GOV-08):** a NEW **`docs/LEGAL.md`** (ToS/legal posture + audit retention policy + consent model) and a NEW **`extension/config/service-denylist.json`** (`{ v, deniedOrigins:[...], deniedReason }`), loaded at SW startup and checked in the consent gate **BEFORE** per-origin policy. Linked from the control panel + the existing showcase privacy page.
- **D-16:** The denylist ships a **conservative category seed** (banking / government / primary-email patterns) with an "automation prohibited" reason, documented as user-extensible — NOT empty, NOT an aggressive broad blocklist.

### Claude's Discretion
- The exact `CONSENT_*` reason-code names and how the pending-Ask request is surfaced (badge text, control-panel queue) — planner names them; they must surface through the existing error passthrough.
- The storage-envelope version numbers and the consent-store / audit-log API surface names.
- The JCS canonicalization implementation details (vendor a minimal RFC-8785 canonicalizer vs. a focused in-house serializer) and the audit ring size.
- The control-panel layout specifics WITHIN the Phase-245 settings-card pattern, and the sensitive-origin heuristic thresholds.
- Whether `recipe-signature.js` / `consent-policy-store.js` / `audit-log.js` live under `extension/utils/` and which join `RECIPE_PATH_ALLOWLIST` (any that sit on the recipe/interpret path MUST be eval-free + allowlisted).

### Folded Todos
None — no pending todos matched Phase 30.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

Requirements / roadmap / prior context:
- `.planning/REQUIREMENTS.md` — GOV-01..08 (lines 45-52), SIGN-01..02 (lines 78-79); GOV-06 auth-stays-local (the redactor mandate).
- `.planning/ROADMAP.md` — Phase 30 details (lines 92-104); the Invariants preamble INV-01..04 (lines 17-20); Phase 31/32 boundaries (the learn/heal deferrals this phase must NOT pull in).
- `.planning/phases/29-catalog-tiered-router-bundled-head-declarative-tail-autopilo/29-CONTEXT.md` — the Phase-29 router/catalog/invoke this phase wraps; D-12 origin-pin; the `<deferred>` naming GOV as Phase 30.
- `.planning/phases/27-authenticated-fetch-primitive-main-world-origin-pin-resume-s/27-CONTEXT.md` — the two-point origin-pin + `executeBoundSpec` result shape (the gate sits ABOVE this; the pin still holds).

Source anchors (verified by the Phase-30 codebase scout, `automation-worktree`, 2026-06-21):
- `extension/utils/capability-router.js:182-216` — `FsbCapabilityRouter.invoke(slug, args, ctx)`, the SINGLE chokepoint the consent gate wraps (D-01).
- `extension/ws/mcp-tool-dispatcher.js:2208-2236` (`handleCapabilitiesInvokeMessageRoute`) + `extension/ai/tool-executor.js:672-716` (`executeCapabilityToolForAutopilot`) — the two front doors that both hit the gate.
- `extension/utils/agent-registry.js` (`isOwnedBy`, `getOwner`) + `tests/ownership-error-codes.test.js` — the EXISTING ownership gate the consent gate sits immediately after (GOV-04).
- `extension/utils/capability-fetch.js:228` — `MUTATING_METHODS` (POST/PUT/PATCH/DELETE), the side-effect classifier for GOV-03 (D-04).
- `extension/utils/capability-interpreter.js:124` — `interpretRecipe`; the signature-verify hook slots AFTER schema-validate, BEFORE bind (D-06).
- `extension/utils/redactForLog.js:29-63` — the shape-only redactor reused for the audit log + capture (GOV-06, D-11).
- `extension/utils/diagnostics-ring-buffer.js` + `tests/diagnostics-ring-buffer.test.js` — the append-only `chrome.storage.local` ring-buffer pattern to clone for `audit-log.js` (D-09).
- `extension/config/secure-config.js` — encrypted `chrome.storage.local` precedent (auth-stays-local reference; the audit log is NOT encrypted but MUST be secret-free).
- `extension/ui/control_panel.html:54+` (nav `data-section`s; Advanced Settings card `:344+`) + `extension/ui/options.js` (`defaultSettings`, cacheElements/listeners) + `tests/change-report-settings-ui.test.js` — the Phase-245 toggle UI template for the Consent & Audit section (D-13).
- `tests/mcp-restricted-tab.test.js` — the existing `chrome://`/`about:` restriction precedent (consent gate sits above it).
- `showcase/angular/src/app/pages/privacy/privacy-page.component.html` + `tests/showcase-privacy-page.test.js` — the privacy page to link the legal posture from (D-15).
- `extension/utils/capability-search.js` typed-error passthrough + `mcp/src/errors.ts` `/^RECIPE_.+$/` — how `CONSENT_*` / `RECIPE_SIGNATURE_INVALID` reasons must surface (no schema break).
- `scripts/verify-recipe-path-guard.mjs` (`RECIPE_PATH_ALLOWLIST`, Check 4/5) — any new recipe-path-adjacent module MUST be eval-free + allowlisted.
- Greenfield (no analog — net-new): `extension/utils/recipe-signature.js`, `extension/utils/consent-policy-store.js`, `extension/utils/audit-log.js`, `extension/config/service-denylist.json`, `docs/LEGAL.md`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`FsbCapabilityRouter.invoke`** (`capability-router.js:182`) — the single chokepoint; the gate wraps it once for both front doors (INV-02 parity carried forward).
- **`redactForLog`** (`redactForLog.js:29-63`) — shape-only redactor (URLs→origin, strings→{kind,length}, errors→name+message, no bodies); the GOV-06 redactor for the audit log + capture. No new redactor needed.
- **`MUTATING_METHODS`** (`capability-fetch.js:228`) — the read-vs-mutating classifier for GOV-03.
- **`diagnostics-ring-buffer.js`** — the append-only `chrome.storage.local` versioned-envelope ring (FIFO, persisted, export/clear) — the exact pattern to clone for `audit-log.js`.
- **`agent-registry.js`** — versioned `chrome.storage` envelope read/write pattern to clone for `consent-policy-store.js`; also the ownership gate the consent gate follows.
- **Phase-245 change-report toggle** (`control_panel.html` + `options.js` + `change-report-settings-ui.test.js`) — the EXACT settings-UI template for the Consent & Audit section.

### Established Patterns
- **Versioned `chrome.storage.local` envelopes** `{ v, ... }` for cross-restart state (agent-registry, diagnostics ring) — used for consent policies + audit log.
- **Typed dual-field error passthrough** (`createRecipeError` + `/^RECIPE_.+$/`) — `CONSENT_REQUIRED` / `RECIPE_SIGNATURE_INVALID` surface verbatim without an `errors.ts` edit.
- **Single dispatch chokepoint + gate-after-ownership** — the ownership gate (Phase 240) establishes the pattern; consent is the next gate in the same chokepoint.
- **control_panel `data-section` nav + `options.js` `defaultSettings`** — the settings-UI structure for new toggles/sections.
- **Eval-free + `RECIPE_PATH_ALLOWLIST`** — any recipe-path-adjacent module (esp. `recipe-signature.js` reached from `interpretRecipe`) must be eval-free and allowlisted or CI Check 4/5 reds.

### Integration Points
- `extension/utils/consent-policy-store.js` (NEW) — per-origin Off/Ask/Auto + elevated mutating opt-in; default OFF.
- `extension/utils/recipe-signature.js` (NEW) — Web Crypto Ed25519 + JCS verify; called from `interpretRecipe`.
- `extension/utils/audit-log.js` (NEW) — append-only redacted ring over `chrome.storage.local`.
- `extension/config/service-denylist.json` (NEW) + load at SW startup (`background.js`), checked first in the gate.
- `extension/utils/capability-router.js` (MODIFIED) — `invoke` wrapped by the consent + mutation gate (the only behavioral change to Phase-29 router).
- `extension/utils/capability-interpreter.js` (MODIFIED) — signature-verify hook after schema-validate, before bind.
- `extension/ui/control_panel.html` + `extension/ui/options.js` (MODIFIED) — the Consent & Audit section.
- `extension/background.js` (MODIFIED) — additive importScripts for the new modules + denylist load.
- `scripts/verify-recipe-path-guard.mjs` (MODIFIED) — allowlist the new recipe-path-adjacent modules.
- `docs/LEGAL.md` (NEW) + `showcase/angular/.../privacy-page` (MODIFIED) — legal posture + link.
- `tests/*` (NEW) — consent-gate, signature-verify (fixture keypair), audit-log no-secret, mutation-gating, denylist, UI-settings tests; wire into `npm test`.
</code_context>

<specifics>
## Specific Ideas

- **SIGN-01 "Lattice receipts" is realized via Web Crypto Ed25519 + JCS**, NOT a Lattice crypto API (Lattice has none) — the receipt is the provenance envelope shape (D-05). This is a deliberate interpretation of the written requirement, confirmed in discussion.
- **First-party bundled recipes are exempt-by-provenance** from the verify gate (D-07); the real signer for server/learned recipes is Phase 31. Phase 30 ships and TESTS the verify path on a fixture keypair so it is proven, not stubbed.
- **One gate, both front doors** — the consent gate wraps the single `FsbCapabilityRouter.invoke` chokepoint, exactly as Phase 29 achieved one-engine-two-doors. No parallel gate.
- **Audit log is secret-free by construction** — schema excludes args/bodies; everything routes through `redactForLog`; a test asserts no auth substring survives (GOV-06).
- **Default-OFF is the spine** — nothing runs against an origin until explicitly enabled; Auto is per-origin opt-in; mutating needs a second elevated opt-in.

### Pitfalls to avoid
- Do NOT add a second consent gate per front door — wrap the single router chokepoint (INV-02 discipline).
- Do NOT log/persist any auth material in the audit log — schema + redactor + test enforce this (GOV-06).
- Do NOT verify-gate the first-party bundled recipes (they are trusted-by-provenance; gating them would break the working Phase-29 head) — gate only non-bundled provenance.
- Do NOT block the invoke with a synchronous modal for "Ask" — return a typed reason and resolve out-of-band.
- Do NOT break Phase 29: INV-01 hash, INV-02 one-engine, INV-04 iterator, and the origin-pin all still hold; the gate sits ABOVE `executeBoundSpec`, never bypassing the pin.
</specifics>

<deferred>
## Deferred Ideas

- **Real server-delivered / learned recipe SIGNING** (private-key signer, capture→synthesis→promotion, signed at publish) — **Phase 31**. Phase 30 ships only the VERIFY path + fixture keypair.
- **Audit-log long-term archival / rotation depth & legal retention specifics** beyond a bounded ring + export — documented in LEGAL.md; deeper retention tooling later.
- **Exhaustive service denylist** — Phase 30 ships a conservative category seed; comprehensive per-service legal review is ongoing.
- **Encrypted audit log at rest** — out of scope (the log is secret-free by construction; encryption is a later hardening if ever needed).

### Reviewed Todos (not folded)
None — no pending todos matched Phase 30.
</deferred>
