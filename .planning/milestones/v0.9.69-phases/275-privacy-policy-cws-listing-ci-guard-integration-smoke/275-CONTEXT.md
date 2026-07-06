# Phase 275: Privacy Policy Page Update + CWS Listing Diff + CI Guard + Integration Smoke - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Mode:** Auto-generated (mostly content-only phase; few gray areas after Phase 273+274 locked the data flow)
**Milestone:** v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix
**Requirements:** CONS-03, CONS-04, CONS-05, CONS-06, CONS-07
**Blockers:** B3 (CWS listing + Privacy Practices declaration)

<domain>
## Phase Boundary

The Chrome Web Store listing, public privacy policy, and CI all reflect the new telemetry surface so v0.9.69 can be published without policy violation. This phase closes the final release-gating BLOCKER (B3) for the milestone.

**In scope:**
- Update `showcase/angular/src/app/pages/privacy/privacy-page.component.html` adding a new "Anonymous Usage Telemetry" section with:
  - 5 collected fields enumerated (UUID, MCP client name, model name, token counts, active-agent count).
  - 6 explicitly-NOT-collected categories (URLs, prompts, DOM, plaintext IPs, names, emails).
  - Retention policy (7d raw / 365d rollups / lifetime global).
  - Kill-switch path (Control Panel > Advanced Settings > "Send anonymous usage data" toggle).
  - GDPR Article 17 erasure curl recipe (`POST /api/telemetry/forget` with `{install_uuid}`).
  - Limited Use affirmation.
  - Stable anchor `#telemetry-disclosure`.
  - "We publish aggregated metrics here" link → `/stats`.
- AI-fill the new privacy section across 5 non-en locales (es/de/ja/zh-CN/zh-TW) matching v0.9.63 i18n discipline.
- Update `store-assets/chrome-web-store/listing-copy.md` with "Data we collect" section mirroring the privacy page; include link to the privacy policy.
- New `store-assets/chrome-web-store/privacy-practices-evidence.md` documenting which CWS Privacy Practices checkboxes must be ticked at publish time:
  - "Personally identifiable information" — YES (UUID is a regulated "identification number" under CWS User Data FAQ).
  - "Web history" — NO.
  - Privacy Policy URL — `https://full-selfbrowsing.com/privacy#telemetry-disclosure`.
  - "Limited Use" certification — YES.
- New `scripts/verify-store-listing.mjs` CI guard that fails the build if:
  - `listing-copy.md` lacks a "Data we collect" / "Data Collection" section.
  - The homepage URL in `extension/manifest.json` doesn't lead to `/privacy` (or the listing-copy doesn't reference `full-selfbrowsing.com/privacy`).
  - The privacy policy URL referenced doesn't end with `#telemetry-disclosure` or `/privacy`.
- CI gate wired into the website job in `.github/workflows/ci.yml` (or root `npm test` chain if simpler — match existing v0.9.63 pattern).
- Tests:
  - `tests/showcase-privacy-page.test.js` (200 + literal "FSB Telemetry" / "Anonymous Usage Telemetry" present; #telemetry-disclosure anchor present in rendered HTML).
  - `tests/verify-store-listing.test.js` (runs the verify-store-listing.mjs script; asserts pass).
- Integration smoke (manual notes in SUMMARY.md): walk the full end-to-end on a local Chrome (load-unpacked extension + local showcase server) — described as a checklist for user to run.

**Explicitly NOT in scope:**
- First-run privacy banner UI (deferred per D-02 / TELEMETRY-FUTURE-01).
- "View what we send" live JSON preview panel (deferred per TELEMETRY-FUTURE-02).
- In-extension "Reset anonymous ID" button (deferred per TELEMETRY-FUTURE-03).
- In-extension "Wipe my telemetry data" button (deferred per TELEMETRY-FUTURE-04 — the backend `/forget` endpoint shipped in Phase 273 INGEST-12; the curl recipe is documented in this phase via privacy policy).
- Region-gated opt-IN for EU/UK/CA installs (deferred per TELEMETRY-FUTURE-05).
- The actual CWS Developer Dashboard click-through to update Privacy Practices tab (user-gated post-merge per D-15 — Phase 275 produces the in-repo `privacy-practices-evidence.md` diff that documents what to tick).
- Dashboard streaming fix (Phase 276).

</domain>

<decisions>
## Implementation Decisions

### Privacy policy page structure
- New section appended after the existing privacy content. H2 heading "Anonymous Usage Telemetry" (i18n-marked).
- Stable anchor: `<h2 id="telemetry-disclosure" i18n="@@PRIVACY_TELEMETRY_HEADING">Anonymous Usage Telemetry</h2>`.
- Subsections (each H3 or strong-block, all i18n-marked):
  1. **What we collect** — 5-bullet list (UUID, MCP client, model, tokens, active-agent count).
  2. **What we do NOT collect** — 6-bullet list (URLs, prompts, DOM, plaintext IPs, names, emails).
  3. **Retention** — 7 days raw / 365 days daily rollups / forever for global aggregates (1 row/day).
  4. **How to opt out** — Control Panel > Advanced Settings > toggle off.
  5. **How to erase your data** — `curl -X POST -H "Content-Type: application/json" -d '{"install_uuid":"<your-uuid>"}' https://full-selfbrowsing.com/api/telemetry/forget`. Note: UUID is visible in chrome.storage.local under key `fsbInstallUuid` (briefly explain how to access it via DevTools > Application > Storage).
  6. **Limited Use affirmation** — exact CWS-compliant language stating the data is only used for aggregate FSB usage statistics, not sold, not shared with third parties, not used for ML training.
  7. **Aggregated public metrics** — link to `/stats` with the "we publish aggregated metrics here" phrasing.

### CWS listing-copy.md update
- Append a "Data Collection" section at the end (or after the existing Description section, matching the listing-copy.md flow).
- Mirror the 5 collected / 6 NOT-collected lists from the privacy page (concise version).
- Include the link `https://full-selfbrowsing.com/privacy#telemetry-disclosure`.

### CWS Privacy Practices evidence file (NEW)
- Path: `store-assets/chrome-web-store/privacy-practices-evidence.md`.
- Documents in markdown:
  - Which checkboxes to tick on the CWS Developer Dashboard Privacy Practices tab.
  - Screenshot expectations (the actual screenshots can be added in a follow-up; the file documents what they should show).
  - Limited Use compliance statement.
  - Justification per checkbox.
- This file is the in-repo source-of-truth for what the user does at publish time.

### verify-store-listing.mjs
- Path: `scripts/verify-store-listing.mjs` (or `scripts/store/verify-store-listing.mjs` — match existing conventions).
- Reads `store-assets/chrome-web-store/listing-copy.md` and asserts:
  - Section heading matching `/^##\s+(Data Collection|Data we collect)/im` exists.
  - String `full-selfbrowsing.com/privacy` appears somewhere in the file.
  - String `#telemetry-disclosure` appears in either listing-copy.md or privacy-practices-evidence.md.
- Reads `store-assets/chrome-web-store/privacy-practices-evidence.md` and asserts file exists + is non-empty.
- Reads `extension/manifest.json` and asserts `homepage_url` exists and ends with `full-selfbrowsing.com` (or links to a /privacy-bearing path).
- Exit 0 on pass, exit 1 with descriptive errors on fail.

### CI wiring
- New `scripts/verify-store-listing.mjs` invoked from root `npm test` chain after `tests/showcase-build-smoke.test.js` (Phase 274's last addition). OR added to website job in `.github/workflows/ci.yml` (match Phase 273's CI pattern).
- Recommend: root `npm test` chain insertion to keep CI surface unified.

### i18n
- 20-30 new trans-units for the privacy page section.
- AI-fill 5 non-en locales matching v0.9.63 + v0.9.69 Phase 274 pattern.
- Build smoke: `npm --prefix showcase/angular run build` succeeds with `i18nMissingTranslation: error`.

### Tests
- `tests/showcase-privacy-page.test.js`: build the showcase Angular site, fetch `/privacy` (or render the component), assert presence of:
  - "Anonymous Usage Telemetry" string.
  - `id="telemetry-disclosure"` attribute.
  - The 5 collected fields literally listed.
  - The 6 NOT-collected categories literally listed.
  - The `/api/telemetry/forget` curl recipe.
  - Link to `/stats`.
- `tests/verify-store-listing.test.js`: invoke `node scripts/verify-store-listing.mjs`; assert exit 0.

### Limited Use exact phrasing
Use the Chrome Web Store-compliant language:
> "FSB's anonymous usage telemetry is used only to compute aggregate usage statistics displayed publicly at full-selfbrowsing.com/stats. The data is never sold, never shared with third parties, never used for advertising, and never used to train any machine-learning models. This commitment satisfies the Chrome Web Store's Limited Use requirement."

### Claude's Discretion
- Exact wording / tone of the privacy section copy (match the existing privacy-page tone — currently a developer-focused but accessible technical voice).
- Whether to include a small data flow diagram (recommend no — keep it text-only for translation).
- Whether to also link the privacy section from the footer (recommend no — already linked via the kill-switch's "Read full policy" link from Phase 269).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showcase/angular/src/app/pages/privacy/privacy-page.component.html` (140 lines, 70 i18n markers) — existing privacy page with v0.9.63 i18n discipline. Append new section.
- `store-assets/chrome-web-store/listing-copy.md` (79 lines) — current CWS listing copy; append new section.
- `showcase/angular/scripts/` — existing showcase scripts dir; verify-store-listing.mjs could land here OR at root `scripts/`. Existing root `scripts/package-extension.mjs` precedent suggests root `scripts/` is appropriate.
- Phase 274's `tests/showcase-build-smoke.test.js` — pattern for the verify-store-listing.test.js wiring.

### Established Patterns
- All i18n markers use the `@@CUSTOM_ID` form per v0.9.63 convention.
- Translation files at `showcase/angular/src/locale/messages.{lang}.xlf`.
- Build-time `i18nMissingTranslation: error` invariant.

### Integration Points
- `showcase/angular/src/app/pages/privacy/privacy-page.component.html` end of body — append new section.
- `showcase/angular/src/locale/messages.xlf` + 5 non-en locale files — add trans-units.
- `store-assets/chrome-web-store/listing-copy.md` — append "Data Collection" section.
- `store-assets/chrome-web-store/privacy-practices-evidence.md` (NEW).
- `scripts/verify-store-listing.mjs` (NEW).
- `package.json` test chain — insert after `tests/showcase-build-smoke.test.js`.

</code_context>

<specifics>
## Specific Ideas

- The privacy section copy should be CONCISE (a v0.9.69 visitor isn't going to read a wall of text). Aim for ~250-350 words across all subsections combined.
- The curl recipe MUST be syntactically valid; test with shellcheck if possible.
- The Limited Use language is verbatim per Chrome's policy — DO NOT paraphrase the "never sold / shared / used for advertising / used to train ML models" clause.

</specifics>

<deferred>
## Deferred Ideas

- First-run privacy banner UI (TELEMETRY-FUTURE-01).
- "View what we send" live JSON preview panel (TELEMETRY-FUTURE-02).
- "Reset anonymous ID" button (TELEMETRY-FUTURE-03).
- "Wipe my data" button (TELEMETRY-FUTURE-04).
- Region-gated opt-IN for EU/UK/CA (TELEMETRY-FUTURE-05).
- Privacy section data-flow diagram.
- Footer link to /privacy#telemetry-disclosure.

</deferred>
