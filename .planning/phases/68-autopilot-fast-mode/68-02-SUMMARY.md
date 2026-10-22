---
phase: 68-autopilot-fast-mode
plan: 02
subsystem: content-scripts
tags: [jev, fast-mode, element-menu, content-script, risk-classifier, ref-registry, vault, auto-02, auto-03, d-13, d-14, d-15, d-19]

# Dependency graph
requires:
  - phase: 68-01
    provides: "68-SYNC-RECHECK.md (P68_START ba745cfe, item h slice hashes, drift substitutions), 68-SWEEP-BASELINE.json, the registration tail"
  - phase: 67
    provides: "FsbJevState.buildRequest element contract {id, role, label, ops, inputType?, autocomplete?, purpose?:{sensitive?}, hidden?} and CONTRACT.OPERATIONS"
provides:
  - "dom-state.js: JevRefRegistry (j1..jN, generation '<8 hex nonce>-<n>'), FSB.JevRefRegistry, FSB.jevRefMap, FSB.vaultFilledElements (WeakSet), FSB.noteVaultFilled"
  - "actions.js: four guarded FSB.noteVaultFilled calls in fillCredentialFields and fillPaymentFields"
  - "dom-analysis.js: one marked block with FSB.jevMenuConstants, FSB.jevSafeText, FSB.jevMenuLabel, FSB.jevElementOps, FSB.classifyJevRisk, FSB.jevVisibleText, FSB.buildJevMenu"
  - "tests/fixtures/jev-content-dom-kit.js: stub element/document/window/crypto kit with a value-read spy"
  - "tests/jev-fast-menu.test.js (76 checks, registered): registry, vault marks, labels, ops, press_enter, risk oracle, menu assembly, excerpt, byte identity"
affects: [68-03, 68-04, 68-05, 68-08, 68-10, 68-11, 68-12, V3, V5]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Marker-bounded content blocks ('// ---- Phase 68 fast-mode registry (begin|end) ----' in dom-state.js, '// ==== Phase 68 fast-mode element menu (begin|end) ====' in dom-analysis.js) that tests slice and evaluate"
    - "Value-read spy: the stub kit's value property is a getter that logs every read; extractor tests assert the log stays empty"
    - "Union risk classifier: every rule evaluated, the reported reason is the first hit in a fixed order"
    - "Cross-realm results (vm arrays) are copied out (Array.from / JSON) before strict deep-equality"

key-files:
  created:
    - tests/fixtures/jev-content-dom-kit.js
    - tests/jev-fast-menu.test.js
  modified:
    - extension/content/dom-state.js
    - extension/content/actions.js
    - extension/content/dom-analysis.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The registry nonce is computed lazily, once per JevRefRegistry instance, from crypto.getRandomValues (Math.random only if crypto is missing); generation is '<nonce>-<resets>' and starts at '-0'"
  - "jevMenuLabel never descends into, and never uses as a label source, an element that is itself a control, option list, editable region or text-entry role (aria-labelledby targets and label elements included), because jevSafeText always walks its root"
  - "press_enter: an INPUT with type search or role searchbox whose el.form, if any, has no other user-editable member, no password/cc-*/one-time-code/new-/current-password member and no submit control that any rule except form_submit (and enter_submits_form) excludes"
  - "Reset controls in a form are reported as form_submit; purpose intent 'download' joins submit/login/signup under purpose_intent (tighten-only)"
  - "fastEligible additionally requires not hidden, not purpose.sensitive and not disabled/aria-disabled (tighten-only; the plan's five conditions all still apply)"
  - "getMarkdownSnapshot stays absent from dom-analysis.js (drift substitution 1); the byte-identity case pins buildMarkdownSnapshot and formatInlineRef only"

patterns-established:
  - "Later content plans (68-03 resolver, 68-08 capture) add their code inside the dom-analysis.js marked block and reuse jevControl/jevMenuRole/jevMenuLabel/classifyJevRisk rather than re-deriving them"

requirements-completed: [AUTO-02, AUTO-03]

# Metrics
duration: 24min
completed: 2026-10-17
---

# Phase 68 Plan 02: Value-free fast-mode element menu Summary

**The content script can now describe the main frame as a capped, ordered, value-free menu of j-handles drawn from a 256-element candidate pool. Each entry carries code-derived operations (never type_text or select_option, nothing for "on" controls) and a union-based risk reason, and all entries live in a separate registry, so the LLM's e-refs never move. Elements filled by the credential and payment tools are marked in a content-side WeakSet. Nothing calls the extractor yet; plan 68-03 adds the `getJevMenu` message.**

## Performance

- **Duration:** about 24 min
- **Started:** 2026-10-17T08:43Z (right after the 68-01 docs commit)
- **Completed:** 2026-10-17T09:07Z
- **Tasks:** 3 of 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- **Separate registry (D-14, F16, T-68-03).** `JevRefRegistry` sits directly after `const refMap = new RefMap();` in `dom-state.js`, between the registry marker comments. It provides:
  - `reset()`, `register(el, role, name)` returning `'j<n>'`, `get(handle)` returning `{element: WeakRef, role, name}` or null, `findHandle(el)` and `size`;
  - `generation`, `'<8 lower-hex nonce>-<n>'`. The nonce comes from `crypto.getRandomValues` once per instance. A fresh instance is at `-0` and each `reset()` adds 1.

  Building a menu resets only `FSB.jevRefMap`. The suite proves that `FSB.refMap.resolve('e2')` and `generationId` are unchanged after a fast-mode reset and four registrations. RefMap, ElementCache and their slice markers are untouched; the dom-state.js diff against P68_START is purely additive.
- **Vault-fill marks (D-13).** `FSB.vaultFilledElements` is a WeakSet. `FSB.noteVaultFilled(el)` adds only objects. Four guarded calls, `if (typeof FSB.noteVaultFilled === 'function') FSB.noteVaultFilled(<el>);`, sit after the username fill, after the password fill, and before each of `fillField`'s two `return true` paths (select and input). No value is recorded. The actions.js diff is purely additive.
- **Labels without field content (D-13, F4, F18, T-68-05).** `jevMenuLabel` follows the ARIA order but never calls the LLM-snapshot name function:
  - **Order:** static `value` attribute of submit/button/reset inputs, `alt` of image inputs, aria-labelledby, aria-label, `el.labels` (else the nearest LABEL ancestor), contents for name-from-content roles, img alt, placeholder, title.
  - **Text sources:** every one goes through `jevSafeText`.
  - **Proof:** the five F4 cases (Bio, Country, Name, Notes, Comment) carry none of their secret markers. A differential case loads the real `accessibility.js` over the same stub elements. Its name function returns `"Bio SECRET-DRAFT-2"` and the Country label with both option texts, while `jevMenuLabel` returns `"Bio"` and `"Country"`.
- **Code-derived operations (D-15, F2, AUTO-03, T-68-01).** The operations come from `jevElementOps`:

  | Element | ops |
  | --- | --- |
  | button, `[role=button\|link\|tab\|menuitem\|option\|treeitem]`, `a[href]`, summary of a closed details, button-type inputs | `click`, `hover` |
  | unchecked, non-indeterminate native checkbox or radio | `check_box` |
  | `[role=checkbox\|switch\|radio\|menuitemcheckbox\|menuitemradio]` with `aria-checked="false"` | `click` |
  | eligible search field | `press_enter` |
  | text inputs, textarea, select, contenteditable, text-entry roles | `click` (never fast-eligible) |
  | file and hidden inputs, toggles with no state, everything else | none |

  Any "on" control gets no operations. That covers aria-checked or aria-pressed of true or mixed, aria-expanded or aria-selected of true, checked or indeterminate native boxes, and the summary of an open details.
- **Union risk classifier (D-19, F3, T-68-02).** `classifyJevRisk(el, ctx)` evaluates every rule and reports the first hit in a fixed order. The suite covers:
  - Save, Publish, `input[type=submit value=Delete]`, a dialog's Continue and a Delete button labelled "Continue";
  - the four 67-10 risk-true targets: confirm-modals Continue and Delete permanently, wizard Submit, settings Save;
  - null results for Next, Show details, Tab 2 and an unchecked Alpha box outside forms.
- **Menu assembly (AUTO-02).** `buildJevMenu({cap, recent})`:
  - **Pool:** returns `not_main_frame` outside the top frame. Otherwise it calls `FSB.getFilteredElements({maxElements: limits.MENU_POOL, viewportComplete: true, prioritizeViewport: true, taskType: 'general', guideSelectors: null})`.
  - **Order, skips and cap:** in-viewport first by rect centre, then document order through `compareDocumentPosition`. FSB overlay nodes, `dataset.fsbRole` pseudo-elements and empty labels are skipped. The cap is clamped to 32..64 (default 48).
  - **Registration:** resets `FSB.jevRefMap` once and registers each kept entry.
  - **Return value:** `{success, generation, url, title, visibleText, moreBelow, signature, count, truncated, entries, recentHandles}`.
- **Byte identity.** The SHA-256 of `buildMarkdownSnapshot` (`820fa063...dc61`) and `formatInlineRef` (`4c7dae4c...f8e1`) still equal 68-SYNC-RECHECK.md item h. `function getMarkdownSnapshot(` is still absent. Both are pinned in the suite.

## Implemented details the plan asked to record

**Reason codes (fixed report order):** `purpose_danger`, `purpose_intent`, `commit_word`, `form_submit`, `alertdialog`, `dialog_affirmative`, `download`, `javascript_href`, `logout`, `file_input`, `consent_checkbox`, `credential_or_payment_form`, `enter_submits_form`, `vault_filled`. What each rule checks:
- `purpose_danger`: `purpose.danger === true`.
- `purpose_intent`: intent `submit`, `login`, `signup` or `download`.
- `commit_word`: the pattern below over every name source:
  - the menu label;
  - the element's own text, up to 200 chars, never read for fields or editable regions;
  - title and aria-label;
  - the `value` attribute of BUTTON and button-type inputs, and the alt of image inputs;
  - aria-describedby text.
- `form_submit`: a submit or reset control (input submit/image, a button whose type is missing, submit or invalid, input/button reset) with a form.
- `alertdialog`: any ancestor-or-self with role alertdialog.
- `dialog_affirmative`: an affirmative name (ok, okay, yes, continue, proceed, confirm, sure, got it, i understand, accept, agree, allow, approve) inside role=dialog, `aria-modal="true"` or an open DIALOG.
- `download`: `a[download]` or `area[download]`.
- `javascript_href`: `href` that starts with `javascript:` after control characters and whitespace are stripped.
- `logout`: `href` or a name matching `log[\s_-]*(out|off)` or `sign[\s_-]*(out|off)`.
- `file_input`: an input with type file.
- `consent_checkbox`: a checkbox-like control whose name matches `agree|accept|terms|subscri|consent|newsletter|opt-in|marketing`, or whose inferElementPurpose role is `consent-input`.
- `credential_or_payment_form`: the element itself is a password, cc-*, one-time-code, new-password or current-password field, or its form (el.form or ancestor FORM) holds such a field, a vault-filled member, an inferElementPurpose payment-input or a credential-input with intent password.
- `enter_submits_form`: a search field whose press_enter rule fails.
- `vault_filled`: the element is in `FSB.vaultFilledElements`.

**Commit-word pattern** (`\b(?:...)\b`, case-insensitive): submit, send, post, publish, save, apply, update, confirm, done, finish, complete, checkout, check\s*out, pay, purchase, buy, order, place\s+order, delete, remove, erase, discard, archive, cancel, unsubscribe, subscribe, sign\s*in, log\s*in, login, sign\s*up, signup, register, create\s+account, log\s*out, logout, sign\s*out, transfer, withdraw, donate, accept, agree, approve, authori[sz]e, allow, install, upgrade, reset, deactivate, close\s+account, share, invite, upload, book, reserve, vote, report, block.

**press_enter form rule as implemented.** A search field is an INPUT whose type attribute is `search` or whose role is `searchbox`; inferElementPurpose and aria-label text never count. Fields without `el.form` are eligible. With a form, every other member of `form.elements` is checked, and press_enter is refused when a member is:
- a password, cc-*, one-time-code, new-password or current-password field;
- user-editable: an INPUT whose type is not hidden, submit, button, reset or image (checkboxes and radios count), a TEXTAREA or a SELECT;
- a submit control (input submit/image, or a button whose type is not button or reset) that `jevRiskReasons(member, {}, {skip: ['form_submit', 'enter_submits_form']})` excludes.

A refused field gets ops `['click']`, kind text-entry, and risk `enter_submits_form` (or `credential_or_payment_form` when that rule fires first). The oracle results:
- eligible: the site-search form (search field, hidden input, `<button>Search</button>`);
- not eligible: the `subject_query` contact form, the Subscribe form, the multi-field forms (select, checkbox, second text input, textarea) and the password, cc-number and one-time-code forms.

**jevSafeText skip list (below the root):** INPUT, TEXTAREA, SELECT, OPTION, DATALIST, SCRIPT, STYLE, NOSCRIPT, TEMPLATE; any element with a `contenteditable` attribute not equal to "false"; role textbox, searchbox, combobox, listbox or spinbutton; `aria-hidden="true"`. The root is always walked. Only text-node `nodeValue` is read, through an explicit stack. Whitespace is collapsed and the result is cut at maxChars code points. `jevVisibleText` adds these skips:
- SVG, CANVAS, IFRAME, OBJECT and EMBED elements;
- the `hidden` attribute and computed `display:none` or `visibility:hidden`;
- `FSB.isFsbElement` nodes;
- the whole page when the body is editable or `designMode` is on.

It also separates non-inline elements with a space.

**MENU_POOL and truncated.** `FSB.jevMenuConstants` = `{MENU_CAP: 48, MENU_CAP_MIN: 32, MENU_CAP_MAX: 64, MENU_POOL: 256, TEXT_EXCERPT_CHARS: 2000, LABEL_CHARS: 80, ROLE_CHARS: 32, MORE_BELOW_PX: 200}` (frozen). After `cap` entries are kept, the walk continues only until one more keepable candidate is found: not an overlay, not a pseudo-element, non-empty label. `truncated = anotherKeepable || pool.length >= MENU_POOL`. The suite covers:
- 70 candidates at cap 64: 64 entries, truncated true;
- 70 with no cap: 48, true;
- 40 at cap 48: 40, false;
- 49 whose 49th has no label: 48, false;
- an exact pool of 256: true, even with only 10 labelled entries;
- caps 10, 1000, 40.7, 'many' and NaN: 32, 64, 40, 48 and 48.

**Entry, signature, recentHandles.** Each entry is `{handle, role, label, ops, inputType, autocomplete, purpose:{sensitive, danger, intent}, hidden, risk, fastEligible, vaultFilled, state:{checked, expanded, selected, pressed}, inViewport}`.
- **`fastEligible`:** ops are non-empty, risk is null, the centre is in the viewport, the element is not text-entry, select or contenteditable, it is not vault-filled, not hidden, not `purpose.sensitive` and not disabled.
- **`signature`:** FNV-1a 32-bit hex over the JSON of `[url, title, count, entries[role, label, ops, state bits]]`.
- **`recentHandles`:** at most 10 descriptors. A `selector` (through `FSB.querySelectorWithShadow`) or a `ref` (through the non-mutating `FSB.refMap.resolve`) that resolves decides the answer: the handle of that element, or null if it is not in the menu. Otherwise `{role, name}` must match exactly one entry.

**Stub kit API (`tests/fixtures/jev-content-dom-kit.js`):**
- `makeElement({tag, attrs, text, type, value, checked, indeterminate, disabled, labels, rect, style, dataset, children, form, isConnected})`. Elements provide `getAttribute`, `hasAttribute`, `setAttribute`, `removeAttribute`, `getBoundingClientRect`, `setRect`, `compareDocumentPosition` (order index), `appendChild` and `closest` (tag, `#id`, `[attr]`, `[attr="v"]`). They also expose `id`, `name`, `className`, `placeholder`, `href`, `alt`, `title`, `hidden`, `multiple`, `type`, `children`, `firstElementChild`, `textContent`, `isContentEditable`, `form` (nearest FORM for form-associated tags), `elements` (FORM only) and `labels`. `value` is a getter that logs reads.
- `makeText(value)` (nodeType 3 with `nodeValue`/`data`).
- `makeDocument(body, {title, scrollHeight, clientHeight, selectorMap})`, which provides `getElementById`, `querySelectorAll`/`querySelector` over the selector map, `documentElement.scrollHeight` and `renumber()`.
- `makeWindow({innerWidth, innerHeight, scrollY, href, top})` with `getComputedStyle` and `top` defaulting to itself.
- `cryptoStub(seedBytes)` (advancing bytes, `calls` counter), `valueReads` and `resetValueReads()`.

## Task Commits

1. **Task 1: Separate fast-mode registry, vault-fill marks, stub kit and the menu suite:** `ae2dc64e` (feat)
2. **Task 2: Value-free labels, code-derived ops and the union risk classifier:** `a88dff51` (feat)
3. **Task 3: Menu assembly (excerpt, full pool, truthful truncation, signature, recent handles):** `bc606a01` (feat)

**Plan metadata:** the `docs(68-02)` SUMMARY commit that follows these.

## Files Created/Modified

- `extension/content/dom-state.js`: the registry block (+83 lines) and four export lines.
- `extension/content/actions.js`: four guarded `FSB.noteVaultFilled` lines.
- `extension/content/dom-analysis.js`: the marked menu block (908 lines between the markers, placed after `getCanvasPixelFallback` and before EXPORT TO NAMESPACE) and seven export lines after `FSB.getFilteredElements = getFilteredElements;`.
- `tests/fixtures/jev-content-dom-kit.js`: new stub kit.
- `tests/jev-fast-menu.test.js`: new suite, 76 checks.
- `package.json`, `tests/delegation-phase-contract.test.js`: `node tests/jev-fast-menu.test.js` appended once each, after `node tests/jev-fast-settings.test.js` (in `ae2dc64e`).

## Decisions Made

See `key-decisions` in the frontmatter. Also:
- **Nonce timing:** the registry nonce is lazy, so a content script that never builds a menu never calls `crypto.getRandomValues`.
- **ctx:** `jevElementOps(el, ctx)` ignores `ctx`, because ops depend only on tag, role, state and form. `classifyJevRisk` accepts an internal `ctx.formCache` (a Map) that `buildJevMenu` passes, so each form's sensitivity is computed once per menu.
- **No extra export:** role, kind and the internal `jevControl`/`jevMenuRole` helpers are not exported. 68-03 adds its resolver inside the same block and can call them directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Label sources that are themselves fields**
- **Found during:** Task 2
- **Issue:** `jevSafeText` must walk its root, so passing an aria-labelledby target or a label element that is itself a textarea, input, select or contenteditable to it would return that field's draft text.
- **Fix:** `jevMenuLabel` skips any aria-labelledby target or label element that is a control, option list, editable region or text-entry role. It also never uses its own contents for INPUT, TEXTAREA, SELECT or editable elements.
- **Files modified:** extension/content/dom-analysis.js
- **Commit:** a88dff51

**2. [Rule 2 - Tighten-only] Extra exclusions beyond the plan's minimum**
- **Found during:** Tasks 2 and 3
- **Issue:** A few cases the plan's lists do not name would otherwise stay fast-eligible.
- **Fix:**
  - Reset controls in a form are `form_submit`.
  - `purpose.intent === 'download'` joins `purpose_intent`.
  - The logout rule also tests name sources.
  - The consent rule adds newsletter, opt-in and marketing, and accepts inferElementPurpose's `consent-input`.
  - Sensitive forms also count inferElementPurpose payment-input, password credential-input and vault-filled members.
  - `fastEligible` also requires not hidden, not `purpose.sensitive` and not disabled.
  - `jevVisibleText` returns '' for an editable body or designMode, and skips canvas, iframe, object and embed.

  All of these only remove fast eligibility, never grant it.
- **Files modified:** extension/content/dom-analysis.js
- **Commits:** a88dff51, bc606a01

**3. [Plan wording] The ops table gains three ARIA toggle roles and treeitem**
- **Found during:** Task 2
- **Issue:** The behaviour list names `[role=checkbox|switch]` only.
- **Fix:** `radio`, `menuitemcheckbox` and `menuitemradio` follow the same rule: `click` only when `aria-checked="false"`, none otherwise. `treeitem` is a click role. File inputs get no ops.
- **Commit:** a88dff51

**4. [Test harness] Real accessibility.js in the main vm context; cross-realm arrays**
- **Found during:** Task 2
- **Issue:** The plan suggested stubbing `getImplicitRole`, but the real module loads cleanly under the kit, which makes the role and contents cases more faithful. Separately, arrays returned from the vm realm fail `assert/strict` deep-equality because of a different Array prototype.
- **Fix:** The suite loads the real accessibility.js before dom-analysis.js. Results are copied out with `Array.from`/JSON before deep-equality. The differential case still uses its own context, as planned.
- **Commit:** a88dff51

**5. [Plan wording] RED and GREEN in one commit per task**
- **Found during:** all tasks
- **Issue:** The plan prescribes exactly one commit per task, and a separate `test(...)` commit would register a red suite in the root chain.
- **Fix:** RED was run and observed before each implementation, and RED and GREEN landed together in each task's commit. RED counts: Task 1, 13 failing checks; Task 2, 41; Task 3, 20 (the byte-identity guard passed in RED, as intended).
- **Commits:** ae2dc64e, a88dff51, bc606a01

---

**Total deviations:** 5 (1 leak-closing fix, 2 tighten-only scope notes, 2 harness or commit-shape notes). **Impact:** no loosening anywhere. Every gate in the plan's acceptance criteria holds as written.

## TDD Gate Compliance

There are no separate `test(68-02)` commits (deviation 5). RED was observed for every task before implementation. GREEN passes 76/76 on Node 24, on `npx --offline -y node@20` and on the official `/tmp/fsb-node20` binary. A mutation spot-check confirmed that the key cases are not vacuous. Each of these mutations broke the named cases:
- omitting `maxElements`: the pool, cap-64, exact-pool and clamp cases;
- letting `jevSafeText` read textareas: the F4, differential and no-value cases;
- dropping viewport-first ordering: the ordering case;
- ignoring `indeterminate`: the checkbox ops case;
- dropping the pool-size truncation: the exact-pool case.

The file was restored byte-for-byte after the check.

## Verification

- `node tests/jev-fast-menu.test.js`: 76 PASS / 0 FAIL on Node 24, `npx --offline -y node@20` (v20.20.2) and `/tmp/fsb-node20/.../node`.
- Content pin suites: all exit 0.
  - `tests/dom-analysis-viewport-priority.test.js`;
  - `node --test tests/selector-fail-closed.test.js tests/text-editing-contract.test.js tests/hung-page-recovery.test.js` (121 pass);
  - `tests/extension-content-script-files-completeness.test.js`;
  - `tests/click-single-dispatch.test.js`, `node --test tests/content-click-single-activation.test.js` and `node --test tests/google-sheets-content-actions.test.js`;
  - `tests/trigger-observe.test.js`, `tests/trigger-lifecycle.test.js` and `tests/overlay-content-audit.test.js`;
  - `tests/ownership-leakage-regression.test.js`, `tests/action-icon-behavior.test.js` and `tests/lattice-replay-background-contract.test.js`;
  - `tests/jev-extension-boundary.test.js` and `tests/delegation-phase-contract.test.js`.
- Sweeps against `68-SWEEP-BASELINE.json`, each run in the background with exit 0 and no new failures:
  - after Task 1, `--files extension/content/dom-state.js extension/content/actions.js`: 41/41 passed;
  - after Task 2, `--files extension/content/dom-analysis.js`: 3/3 passed;
  - after Task 3, over all three files: 42/42 passed.

  Port 7225 was held by the user's hub and was left untouched. No sweep selected showcase-build-smoke, so the crawler files never changed.
- Acceptance greps:
  - `class JevRefRegistry` and `FSB.jevRefMap = jevRefMap` each count 1;
  - the diffs of dom-state.js and dom-analysis.js against P68_START, and of actions.js against its parent, have no removed lines;
  - `FSB.noteVaultFilled` counts 4 in actions.js;
  - no `\bJEV_[A-Z_]+\b` and no `FsbJev` match under extension/content;
  - in the block slice, the non-`getAttribute('value')` `.value` count, `computeAccessibleName`, `FSB.refMap.reset` and `formatInlineRef` are all 0;
  - `textContent` inside `jevSafeText` and `jevMenuLabel` is 0;
  - `maxElements: limits.MENU_POOL` matches once;
  - the package.json registration check exits 0.

## Known Stubs

None. The extractor is intentionally inert: nothing sends a menu request until plan 68-03 adds the `getJevMenu` message case. The vault marks are written by the existing fill tools now and are first read by `buildJevMenu`.

## Deferred to Validation Block

- **M-68-04 (V3):** freeze MENU_CAP 48, MENU_POOL 256, the in-viewport-then-document ordering and TEXT_EXCERPT_CHARS 2000 once calibrated. After V3, changing any of them needs recalibration.
- **M-68-08 (V5):** real-page menus and risk exclusion on re-rendering sites (live labels, real `form.elements`, real `getFilteredElements` scoring, shadow DOM and overlays).

Deferred: M-68-04 (V3), M-68-08 (V5).

## User Setup Required

None.

## Next Phase Readiness

Plan 68-03 can start. It should do three things:
- add `case 'getJevMenu'` in messaging.js calling `FSB.buildJevMenu({cap, recent})`;
- put `resolveJevHandle` and `jevContentVerbOps` inside the dom-analysis.js marked block, before the end marker. It should reuse `jevMenuRole(el)` for the role check and `jevMenuLabel(el)` for the name check, both of which were registered as `role` and `name`. The `generation` and `get(handle).element.deref()` come from `FSB.jevRefMap`;
- call `FSB.classifyJevRisk(el, {})` and `FSB.jevElementOps(el, {})` at execution time.

The block's gates apply to any code 68-03 adds there: no `.value`, no `computeAccessibleName`, no `FSB.refMap.reset`, no `formatInlineRef`.

## Self-Check: PASSED

- FOUND: extension/content/dom-state.js, extension/content/actions.js, extension/content/dom-analysis.js, tests/fixtures/jev-content-dom-kit.js, tests/jev-fast-menu.test.js, this SUMMARY
- FOUND: commits ae2dc64e, a88dff51 and bc606a01 on branch Jev; none carries an attribution line
- `node tests/jev-fast-menu.test.js`: 76 PASS / 0 FAIL after the last commit
