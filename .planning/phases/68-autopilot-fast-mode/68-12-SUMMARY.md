---
phase: 68-autopilot-fast-mode
plan: 12
subsystem: control panel (Advanced Settings) + disclosure fact list
tags: [jev, fast-mode, disclosure, privacy, control-panel, boundary, auto-01, d-06, d-07, m-68-11, t-68-13, t-68-01b]

# Dependency graph
requires:
  - phase: 68-01
    provides: "fsbJevFastModeEnabled (schema, default false, null-guarded options.js wiring), tests/jev-fast-settings.test.js and the word-bounded ui/config token allowlist in tests/jev-extension-boundary.test.js"
  - phase: 68-02
    provides: "the content-side secret-marker cases in tests/jev-fast-menu.test.js (SECRET-DRAFT-1/2, SECRET-VAL, SECRET-OPT-A) and FSB.noteVaultFilled in the actions.js vault fill handlers"
  - phase: 67
    provides: "FsbJevState.buildRequest, CONTRACT.KEYS.element, scrubText / matchesSecret and tests/fixtures/jev-request-cases.js"
provides:
  - "tests/fixtures/jev-fast-disclosure-facts.js: SHARED_PHRASES (28), CARD_ONLY_PHRASES, PAGE_ONLY_PHRASES, FORBIDDEN_PATTERNS, ENFORCEMENT, textOf(html), the one fact list for the card, the privacy page (68-10) and the store copy (M-68-11)"
  - "Advanced Settings card #fsbJevFastModeCard right after Action Change Reports: unchecked #fsbJevFastModeEnabled plus the D-06 disclosure, closed by <!-- /fsbJevFastModeCard -->"
  - "tests/jev-fast-settings.test.js copy-accuracy section (each never-sent claim checked against buildRequest and the 68-02 proofs) and card section (placement, unchecked box, every fact-list phrase, no forbidden pattern); 93 checks"
  - "tests/jev-extension-boundary.test.js: the marker-bounded card range in control_panel.html (exactly one of each marker, end after start, at most 40 lines) and its probes; 198 checks"
affects: [68-10, 68-11, 70, V5, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One fact list, many surfaces: phrases are matched on textOf() text, never raw markup, so translate=\"no\" spans and HTML entities cannot hide or fake a phrase"
    - "Characterization guards for copy: every never-sent claim is tied to the code or proof that enforces it, so a code change that makes a claim false fails the settings suite"
    - "Marker-bounded allowlist: the exempt line range is recomputed from the file at run time; a missing, repeated, inverted or oversized range is itself a violation"

key-files:
  created:
    - tests/fixtures/jev-fast-disclosure-facts.js
    - .planning/phases/68-autopilot-fast-mode/68-12-SUMMARY.md
  modified:
    - extension/ui/control_panel.html
    - tests/jev-fast-settings.test.js
    - tests/jev-extension-boundary.test.js

key-decisions:
  - "The disclosure is split: the toggle description holds the one-sentence summary inside the label, and the sent list, the never-sent list, the provider/no-content paragraph and the experimental paragraph are four setting-hint paragraphs below the label, so reading or clicking the disclosure can never flip the consent switch; the wording is the plan's starting copy unchanged"
  - "control_panel.html joins UI_CONFIG_TOKEN_FILES (the files allowed to hold fsbJevFastModeEnabled), but the token is never stripped there: in that file jev text, the token included, is allowed only on the card's lines, so the token outside the card is still a violation"
  - "The card range is capped at 40 lines (the card is 30) and the markers are required: removing the card, or moving its closing comment far down the file, fails the boundary suite instead of silently widening the allowlist"
  - "The copy-accuracy secret sample is read from tests/fixtures/jev-request-cases.js (the sk- goal case), never invented"

patterns-established:
  - "68-10 tests the privacy-page section against SHARED_PHRASES and PAGE_ONLY_PHRASES and cross-checks the card block (id=\"fsbJevFastModeCard\" through <!-- /fsbJevFastModeCard -->) with textOf()"

requirements-completed: [AUTO-01]

# Metrics
duration: 7min
completed: 2026-10-17
---

# Phase 68 Plan 12: The fast-mode disclosure card and its shared fact list Summary

**Advanced Settings now has an unchecked "Jev fast mode (experimental)" card right after Action Change Reports. It names FSB's server, TypeSafe AI and the OpenRouter route, and it lists what fast mode sends to FSB's server and what it never sends there. Its text is tested against `tests/fixtures/jev-fast-disclosure-facts.js`, the one fact list that the privacy page (68-10) and the store copy (M-68-11) will also use. Each never-sent claim is checked against `FsbJevState.buildRequest` and the 68-02 secret-marker proofs. The 67-11 boundary suite now allows jev text in control_panel.html only on the card's own lines.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-17T11:49:44Z
- **Completed:** 2026-10-17T11:57Z
- **Tasks:** 2 of 2
- **Files modified:** 4 (1 created, 3 modified), plus this SUMMARY

## Accomplishments

- **The fact list (D-06, D-07, M-68-11).** `tests/fixtures/jev-fast-disclosure-facts.js` is CommonJS, has no dependencies and runs on Node 20. It exports:
  - `SHARED_PHRASES` (28 entries; the card and the privacy-page section must both contain each one, matched case-insensitively): "FSB's server", "TypeSafe AI", "OpenRouter", "task text", "query string", "fragment", "title", "visible text", "labels", "roles", "recent", "typed", "field value", "passwords", "payment", "hidden", "file", "saved", "cookies", "API keys", "secret", "off by default", "off at any time", "experimental", "calibrated", "never sent to FSB's server", "fast mode leaves out", "AI provider".
  - `CARD_ONLY_PHRASES`: "keeps no page content", "plans, types and reads".
  - `PAGE_ONLY_PHRASES`: "full-selfbrowsing.com", "7 days", "365 days", "Limited Use", "complies with", "Advanced Settings".
  - `FORBIDDEN_PATTERNS`: `/TypeSafe[^.]*\b(does not|doesn't|never)\s+(retain|store|keep)/i`, `/FSB never reads/i`, `/\bnever reads?\b/i`, `/\bnever sent\s*:/i`.
  - `ENFORCEMENT`, which ties three claims to their proofs: "typed" to tests/jev-fast-menu.test.js (SECRET-DRAFT-1, SECRET-DRAFT-2), "field value" to tests/jev-fast-menu.test.js (SECRET-VAL, SECRET-OPT-A), and "saved" to extension/content/actions.js (noteVaultFilled).
  - `textOf(html)`, which removes comments and tags, decodes `&#39;`, `&#x27;`, `&apos;`, `&rsquo;`, `&nbsp;`, `&#160;` and `&amp;` (the last one last, so nothing is decoded twice), and collapses whitespace.
- **Copy accuracy against the code (T-68-13).** One `buildRequest` call gets a page with these fields: password, hidden and file inputs; cc-number, one-time-code and new-password autocomplete fields; a `purpose.sensitive` field; a vault-filled id; and two ordinary links, one of which carries `value` and `cookie` keys. The call returns ok, with these results:
  - Only the two links remain (`idMap {e0: alpha, e1: bravo}`), and all 8 sensitive fields are counted as dropped.
  - None of the dropped fields' label markers appears in the request.
  - Every element's keys are a subset of `CONTRACT.KEYS.element` (`id, role, label, ops`).
  - Neither `SECRET-QUERY` nor `SECRET-FRAG` appears; the page is sent as origin `https://shop.test` and path `/a/b`.
  - No key named value or cookie appears anywhere in the request, and the link's value and cookie markers are never copied.

  Two more cases use the sk- secret from tests/fixtures/jev-request-cases.js. When the task text holds it, the result is `{ok:false, reason:'sensitive_goal'}`. When the visible text holds it, the secret is removed from the request and the rest of the excerpt stays. Each ENFORCEMENT file exists and holds its markers. Each forbidden pattern fires on a planted sentence, and none fires on the scoped forms.
- **The card (AUTO-01, D-06).** `extension/ui/control_panel.html` lines 636-665 hold `<div class="settings-card" id="fsbJevFastModeCard">` with:
  - the `fas fa-bolt` icon, the title "Jev fast mode (experimental)" and the subtitle "Faster simple clicks during autopilot";
  - a `modern-toggle` holding `<input type="checkbox" id="fsbJevFastModeEnabled">` (no `checked`), with the label "Use Jev for simple steps";
  - the disclosure, followed by `<!-- /fsbJevFastModeCard -->`.

  The card has no status line, no button, no script, no link and no URL. The options.js sites from 68-01 now find the checkbox, so load, save, the listener and the live refresh all reach a real element. No side-panel or options.css file changed.
- **Boundary narrowing (D-06, T-68-01b).** `UI_CARD_FILE`, `UI_CARD_START_MARKER` (`id="fsbJevFastModeCard"`), `UI_CARD_END_MARKER` (`<!-- /fsbJevFastModeCard -->`), `UI_CARD_MAX_LINES` (40) and `cardRange(text)` define the exempt range, and `uiTextHits` applies it only to control_panel.html. The added probes show what is still reported:
  - a Jev word before the card, a `jevX` identifier after it, the settings token outside it, and jev text on the line just before the start marker or just after the closing comment;
  - a repeated start marker, a repeated closing comment, a missing marker, an inverted pair, a range over 40 lines, and a panel with no card (each reported as a card-range error);
  - a Jev word or `jevX` identifier in options.js or config.js text, and the whole card's markup in options.js, config.js, init-config.js, sidepanel.html or options.css.

  Every other rule is unchanged: TREE_PATTERNS, MODULE_PATTERNS, the URL scan, the file-set check, CALLER_PATTERN, the background.js check, the binary word scan, the module lists and every vm check.

## Final card copy

- **Title / subtitle:** Jev fast mode (experimental) / Faster simple clicks during autopilot
- **Toggle label:** Use Jev for simple steps
- **Toggle description (inside the label):** Off by default. When on, FSB's autopilot sends a short description of the current step to FSB's server, which asks TypeSafe AI's Jev model (directly or through OpenRouter) to pick simple clicks faster.
- **Hint 1:** Sent to FSB's server: your task text; the page address without its query string or fragment; the page title; an excerpt of visible text (fast mode leaves out form fields and text you are editing); the labels and roles of visible buttons, links and fields; and a short record of recent simple steps (which listed control was used and whether the page changed).
- **Hint 2:** Never sent to FSB's server: anything typed into fields or any field value; passwords, payment, hidden and file fields; fields FSB filled from your saved passwords or payment methods; URL query strings and fragments; cookies and API keys. Secrets that match FSB's patterns are removed first, and if your task text itself contains one, nothing is sent for that task.
- **Hint 3:** FSB's server keeps no page content. Your AI provider still plans, types and reads, and gets the same page descriptions as with fast mode off.
- **Hint 4:** Experimental: until FSB has calibrated it, fast mode stays inactive and acts on nothing, though a task may still send one step description before it stops asking. You can turn it off at any time.

## Boundary allowlist range rule

In `extension/ui/control_panel.html` only, jev text (any case, any substring, the `fsbJevFastModeEnabled` token included) is allowed on the lines from the one holding `id="fsbJevFastModeCard"` through the one holding `<!-- /fsbJevFastModeCard -->`, both inclusive (lines 636-665 today). The range is recomputed from the file on every run. It is valid only when each marker appears exactly once, the closing comment is on a later line, and the range spans at most 40 lines. An invalid range is reported as a violation together with every jev hit in the file. Outside the range nothing is stripped, so the token there is still a violation. control_panel.html is now in `UI_CONFIG_TOKEN_FILES`, which is the subset check's list of files allowed to hold the token.

## Task Commits

1. **Task 1: One disclosure fact list and code-backed accuracy checks for every never-sent claim:** `3ecd4f35` (test)
2. **Task 2: The Advanced Settings card with the D-06 disclosure and the boundary-suite allowlist:** `66be3520` (feat)

**Plan metadata:** the `docs(68-12)` SUMMARY commit that follows.

## Files Created/Modified

- `tests/fixtures/jev-fast-disclosure-facts.js`: the shared fact list and `textOf` (new)
- `tests/jev-fast-settings.test.js`: copy-accuracy and card sections (68 -> 93 checks)
- `extension/ui/control_panel.html`: the fast-mode card (32 added lines, including the comment above it and a blank line)
- `tests/jev-extension-boundary.test.js`: card range, helpers, probes and the subset-check file list (172 -> 198 checks)

## Decisions Made

See `key-decisions` in the frontmatter. In short:
- The disclosure lists sit outside the toggle label, so the consent switch cannot be flipped by reading them.
- The token in control_panel.html is allowed only inside the card.
- The range is capped and its markers are required.
- The secret sample comes from the existing request cases.

## Deviations from Plan

No auto-fix rule (1-3) fired and nothing needed a Rule 4 decision. I made three choices within the plan's discretion. All of them are stricter than, or match, the plan's letter, and none changes the wording:

1. **Layout of the disclosure (D-06 "wording and layout" discretion).** The plan put the whole description in the toggle description. The summary sentence stays there, and the four remaining paragraphs are `setting-hint` divs below the label. A `<label>` toggles its checkbox on any click, so a long disclosure inside it could opt a user in by accident. The text is the plan's starting copy word for word, and the card section asserts that the sent and never-sent lists sit outside the label.
2. **control_panel.html token handling.** The plan adds control_panel.html to the token's allowed-file list. It is in that list, so the subset check passes, but the token is not stripped there. The only exemption is the card range. A token outside the card is still reported, which is stricter than stripping it file-wide. The 68-01 probe "the token in control_panel.html is reported" stays valid unchanged.
3. **Range cap.** A 40-line cap on the card range was added (the card is 30 lines). The plan required only exactly one of each marker.

## TDD Gate Compliance

Task 2 is `tdd="true"`. RED was observed before the card existed: the card section had 19 failing checks (93 checks, 74 passed), and with the card added but the suite not yet narrowed, the boundary suite failed 2 checks (6 ui/config violations and the token-file subset). GREEN followed in the same working tree. The plan asks for one commit for this task (`feat(68-12): ...`), because the card and the boundary narrowing must land together, so there is no separate `test(68-12)` RED commit for Task 2. Task 1 (`test(68-12)`) is a characterization suite. It passes against the existing code by design ("These checks pass against the current code").

## Verification

- `node tests/jev-fast-settings.test.js`: PASS=93 FAIL=0 on Node 24 (v24.14.1), on the official Node 20.20.2 binary and through `npx --offline -y node@20`.
- `node tests/jev-extension-boundary.test.js`: passed 198, failed 0 (Node 24 and Node 20).
- `node tests/jev-fast-upstream-contract.test.js`: 55 passed.
- The plan's verify list passes: `tests/settings-panel-sync.test.js`, `tests/change-report-settings-ui.test.js`, `tests/delegation-phase-contract.test.js` and `tests/agent-sunset-control-panel.test.js`.
- Every control_panel.html pin suite passes: agent-cap-ui, agent-provider-forbidden-flags, consent-audit-settings-ui, control-panel-scroll-containment, google-sheets-wiring, mcp-session-settings-ui, model-combobox-ui, model-discovery-ui, providers-panel-ui, remote-control-rebrand, settings-schema, voice-input-settings-ui, settings-card-select-clipping and cap-counter-live (`node --test`). `tests/trigger-cap-settings-ui.test.js` fails 2 stepper checks; that failure was already in the 68-SWEEP-BASELINE.
- Sweep: `node scripts/bench/sweep-tests.mjs --files extension/ui/control_panel.html --baseline .planning/phases/68-autopilot-fast-mode/68-SWEEP-BASELINE.json` ran in the background: 20 of 21 passed, "NEW failures vs baseline: none", exit 0. Port 7225 was held by the user's hub and left untouched. `git status --short showcase/angular/public` was empty, so no crawler restore was needed.
- Acceptance greps:
  - `id="fsbJevFastModeEnabled"` appears 1 time, and no `checked` match;
  - card start and closing comment appear 1 time each, at lines 636 and 665, between `fsbChangeReportsEnabled` (622) and `mcpSessionReplaySettings` (667);
  - `git diff --quiet ba745cfe -- extension/ui/sidepanel.html extension/ui/sidepanel.css extension/ui/sidepanel.js extension/ui/options.css mcp/` exits 0.
- A mutation check on the real file (temporary, then restored byte for byte, confirmed with `cmp`) behaved as expected. A `<!-- Jev outside -->` line after the card was reported at its line. Renaming the closing comment produced a card-range error plus every card line.

## Known Stubs

None. The card is static copy, and the switch it shows is the real `fsbJevFastModeEnabled` key from 68-01.

## Threat Flags

None. The card adds no endpoint, script, storage key or network call. T-68-13 and T-68-01b are mitigated as planned. T-68-07 is accepted and goes to V6 (M-68-12).

## Deferred to Validation Block

- **M-68-06 (V5):** check the card and its copy in the real Advanced Settings panel. That covers reading it at half-width next to Action Change Reports (the grid row stretches to the taller card) and confirming that the switch saves, reloads and live-refreshes.
- **M-68-11 (V6):** write the Chrome Web Store privacy-practices form and listing text from the same fact list (`tests/fixtures/jev-fast-disclosure-facts.js`).
- **M-68-12 (V6):** review consent for enabling the switch through MCP. An MCP client can turn it on without the user ever seeing this card; the write is logged (66.1 D-18).

## User Setup Required

None.

## Next Phase Readiness

- 68-10 (privacy page) can now test its section against `SHARED_PHRASES` and `PAGE_ONLY_PHRASES`, and cross-check the card block with `textOf`.
- 68-11's pin audit should record the new card range and the 93- and 198-check counts.
- Phase 70 must re-verify this copy once it also covers `run_task`.

## Self-Check: PASSED

- FOUND: tests/fixtures/jev-fast-disclosure-facts.js
- FOUND: extension/ui/control_panel.html (id="fsbJevFastModeCard" at 636, closing comment at 665)
- FOUND: commit 3ecd4f35 (test(68-12))
- FOUND: commit 66be3520 (feat(68-12))
