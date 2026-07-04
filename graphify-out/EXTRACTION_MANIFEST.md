# Graphify semantic-extraction manifest

Full, exact per-chunk file lists for every subagent dispatch. Each chunk/wave gets one Agent tool call (general-purpose subagent) using the prompt template in .claude/skills/graphify/references/extraction-spec.md, substituting FILE_LIST/CHUNK_NUM/TOTAL_CHUNKS/CHUNK_PATH as shown.

`.planning` is EXCLUDED from this run (planning/process docs, not project content) - code graph is sufficient there.

## Doc chunks (19 total)

### Doc chunk 1/19 - .context (1/5 in dir, 22 files)
CHUNK_NUM=1 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_001.json
```
.context/attachments/18bn64/Review request.md
.context/attachments/1r0yaT/Review request.md
.context/attachments/4cmb8d/Review request.md
.context/attachments/60A9lH/Review request.md
.context/attachments/6gcPpC/Review request.md
.context/attachments/6lAGYu/Review request.md
.context/attachments/74fqJS/Review request.md
.context/attachments/92Djp6/Review request.md
.context/attachments/9XhigS/Review request.md
.context/attachments/AOYasX/pasted_text_2026-06-30_15-50-06.txt
.context/attachments/BgXDQR/Review request.md
.context/attachments/BvIH8T/Review request.md
.context/attachments/D0D7xi/pasted_text_2026-06-23_20-32-27.txt
.context/attachments/DJQHNv/Review request.md
.context/attachments/FtWfCI/Review request.md
.context/attachments/GMXLCM/Review request.md
.context/attachments/IGlQ85/Review request.md
.context/attachments/JS4t6P/Review request.md
.context/attachments/KOD5t8/Review request.md
.context/attachments/KQsfVT/Review request.md
.context/attachments/Kj25Er/Review request.md
.context/attachments/MAoCsP/Review request.md
```

### Doc chunk 2/19 - .context (2/5 in dir, 22 files)
CHUNK_NUM=2 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_002.json
```
.context/attachments/NnQYCV/Review request.md
.context/attachments/QSI8Pl/pasted_text_2026-06-23_20-32-52.txt
.context/attachments/QciJ9n/Review request.md
.context/attachments/TZrDXH/Review request.md
.context/attachments/UzRL8e/Review request.md
.context/attachments/bS56ZS/Review request.md
.context/attachments/cwtlsq/Review request.md
.context/attachments/f5d2IF/Review request.md
.context/attachments/h506pI/Review request.md
.context/attachments/ks5Ti0/Review request.md
.context/attachments/lyQXIA/Review request.md
.context/attachments/pye4qF/Review request.md
.context/attachments/qIwqrI/Review request.md
.context/attachments/v2YFZz/Review request.md
.context/attachments/wJ6sO2/Review request.md
.context/attachments/wpmZCR/Review request.md
.context/attachments/x0Rgve/Review request.md
.context/chrome-code-colors-verify/Default/Extensions/ghbmnnjooekpmoecnnnilnnbdlolhkhi/1.107.1_0/offscreendocument.html
.context/chrome-phantom-sticky-plan/Default/Extensions/ghbmnnjooekpmoecnnnilnnbdlolhkhi/1.107.1_0/offscreendocument.html
.context/chrome-phantom-sticky-verify/Default/Extensions/ghbmnnjooekpmoecnnnilnnbdlolhkhi/1.107.1_0/offscreendocument.html
.context/chrome-phantom-stream-final/Default/Extensions/ghbmnnjooekpmoecnnnilnnbdlolhkhi/1.107.1_0/offscreendocument.html
.context/chrome-phantom-stream-final/Default/Extensions/nmmhkkegccagdldgiimedpiccmgmieda/1.0.0.6_0/html/craw_window.html
```

### Doc chunk 3/19 - .context (3/5 in dir, 22 files)
CHUNK_NUM=3 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_003.json
```
.context/chrome-phantom-stream-measure/Default/Extensions/ghbmnnjooekpmoecnnnilnnbdlolhkhi/1.107.1_0/offscreendocument.html
.context/chrome-phantom-stream-reduced/Default/Extensions/ghbmnnjooekpmoecnnnilnnbdlolhkhi/1.107.1_0/offscreendocument.html
.context/chrome-phantom-stream-tabs/Default/Extensions/ghbmnnjooekpmoecnnnilnnbdlolhkhi/1.107.1_0/offscreendocument.html
.context/chrome-phantom-stream/Default/Extensions/ghbmnnjooekpmoecnnnilnnbdlolhkhi/1.107.1_0/offscreendocument.html
.context/chrome-phantom-stream/Default/Extensions/nmmhkkegccagdldgiimedpiccmgmieda/1.0.0.6_0/html/craw_window.html
.context/plans/agents-masonry-card-polish.md
.context/plans/agents-support-stats-reference-parity-plan.md
.context/plans/build-lattice-standalone-reference-page.md
.context/plans/build-phantomstream-standalone-reference-page.md
.context/plans/build-prometheus-standalone-page.md
.context/plans/capability-call-overlay-implementation-plan.md
.context/plans/carefully-planned-patches-for-the-branch-review-fi.md
.context/plans/control-panel-redesign-1-1-port.md
.context/plans/control-panel-redesign-refinement-pass.md
.context/plans/custom-first-run-onboarding-for-fsb-extension.md
.context/plans/fix-code-snippet-syntax-colors.md
.context/plans/fix-footer-x-icon-rendering.md
.context/plans/fix-onboarding-mcp-copy-command-fan-menu-doesn-t-a.md
.context/plans/fix-phantomstream-sticky-side-panels.md
.context/plans/fix-refresh-poll-race-and-lattice-receipt-duplicat.md
.context/plans/fix-review-follow-ups-denylist-tests-showcase-rout.md
.context/plans/fix-site-maps-globe-land-opacity.md
```

### Doc chunk 4/19 - .context (4/5 in dir, 22 files)
CHUNK_NUM=4 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_004.json
```
.context/plans/fix-sitemap-drift-and-locale-navigation.md
.context/plans/fix-the-four-review-findings.md
.context/plans/flatten-agents-power-and-prompt-cards.md
.context/plans/flatten-agents-use-case-cards.md
.context/plans/flip-capability-consent-to-default-opt-out-fully-o.md
.context/plans/home-fsb-comparison-wordmark-polish.md
.context/plans/patch-18-medium-review-findings.md
.context/plans/patch-capturing-form-trigger-events.md
.context/plans/patch-fix-all-12-high-severity-findings-on-automat.md
.context/plans/patch-mcp-trigger-disconnect-recovery.md
.context/plans/patch-plan-align-sensitive-consent-ui-with-fully-o.md
.context/plans/patch-plan-update-notion-capability-runtime.md
.context/plans/patch-review-findings.md
.context/plans/patch-t1-backing-metadata.md
.context/plans/patch-the-three-confirmed-review-findings.md
.context/plans/patch-trigger-observer-review-findings.md
.context/plans/patches-for-code-review-findings-automation-branch.md
.context/plans/privacy-policy-api-capabilities-clarification.md
.context/plans/privacy-policy-cleanup-phantomstream-disclosure.md
.context/plans/quick-fix-review-findings.md
.context/plans/ram-based-agent-concurrency-default.md
.context/plans/readme-audit-update-stale-capability-catalog-claim.md
```

### Doc chunk 5/19 - .context (5/5 in dir, 18 files)
CHUNK_NUM=5 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_005.json
```
.context/plans/readme-documentation-update.md
.context/plans/release-notes-readme-updates-for-the-v0-9-90-beta-.md
.context/plans/remove-agents-install-section.md
.context/plans/resolve-agent-sunset-test-failures.md
.context/plans/retool-t1a-same-origin-read-capability-wave.md
.context/plans/revert-release-version-metadata-to-0-9-90.md
.context/plans/roll-back-mcp-to-0-10-0-align-straggler-versions-t.md
.context/plans/sync-hotloaded-desktop-extension.md
.context/plans/theme-toggle-audit-fix-manual-toggle-only-in-advan.md
.context/plans/update-privacy-policy-and-archive-march-snapshot.md
.context/plans/validation-gate-repair-plan.md
.context/plans/worldwide-ip-region-dataset-state-level-fit-on-the.md
.context/review-findings-scratch.md
.context/todos.md
.context/uat-excluded-milestone-audit-2026-06-09.md
.context/uat-verification-closeout.md
.context/upload-uat/index.html
.context/upload-uat/sample-upload.txt
```

### Doc chunk 6/19 - extension (1/2 in dir, 22 files)
CHUNK_NUM=6 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_006.json
```
extension/README.md
extension/offscreen/lattice-host.html
extension/offscreen/stt.html
extension/test-data/dom-snapshots/career-page.yaml
extension/test-data/dom-snapshots/data-table.yaml
extension/test-data/dom-snapshots/form-page.yaml
extension/test-data/dom-snapshots/google-sheets.yaml
extension/test-data/dom-snapshots/search-page.yaml
extension/test-data/dom-snapshots/search-results.yaml
extension/test-data/edge-cases/edge_prompts.md
extension/test-data/edge-cases/multiline-reasoning.txt
extension/test-data/edge-cases/special-chars.txt
extension/test-data/edge-cases/url-arguments.txt
extension/test-data/edge-cases/yaml-block.txt
extension/test-data/golden-responses/anthropic/career-search.txt
extension/test-data/golden-responses/anthropic/data-extraction.txt
extension/test-data/golden-responses/anthropic/form-fill.txt
extension/test-data/golden-responses/anthropic/google-sheets.txt
extension/test-data/golden-responses/anthropic/navigation.txt
extension/test-data/golden-responses/anthropic/search-click.txt
extension/test-data/golden-responses/gemini/career-search.txt
extension/test-data/golden-responses/gemini/data-extraction.txt
```

### Doc chunk 7/19 - extension (2/2 in dir, 21 files)
CHUNK_NUM=7 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_007.json
```
extension/test-data/golden-responses/gemini/form-fill.txt
extension/test-data/golden-responses/gemini/google-sheets.txt
extension/test-data/golden-responses/gemini/navigation.txt
extension/test-data/golden-responses/gemini/search-click.txt
extension/test-data/golden-responses/openai/career-search.txt
extension/test-data/golden-responses/openai/data-extraction.txt
extension/test-data/golden-responses/openai/form-fill.txt
extension/test-data/golden-responses/openai/google-sheets.txt
extension/test-data/golden-responses/openai/navigation.txt
extension/test-data/golden-responses/openai/search-click.txt
extension/test-data/golden-responses/xai/career-search.txt
extension/test-data/golden-responses/xai/data-extraction.txt
extension/test-data/golden-responses/xai/form-fill.txt
extension/test-data/golden-responses/xai/google-sheets.txt
extension/test-data/golden-responses/xai/navigation.txt
extension/test-data/golden-responses/xai/search-click.txt
extension/ui/control_panel.html
extension/ui/onboarding.html
extension/ui/popup.html
extension/ui/sidepanel.html
extension/ui/unlock.html
```

### Doc chunk 8/19 - showcase (1/2 in dir, 22 files)
CHUNK_NUM=8 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_008.json
```
showcase/README.md
showcase/about.html
showcase/angular/prerender-routes.txt
showcase/angular/public/llms-full.txt
showcase/angular/public/llms.txt
showcase/angular/public/robots.txt
showcase/angular/scripts/llms-full.source.md
showcase/angular/src/app/app.component.html
showcase/angular/src/app/components/pixel-loader/pixel-loader.component.html
showcase/angular/src/app/layout/language-picker/language-picker.component.html
showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html
showcase/angular/src/app/pages/about/about-page.component.html
showcase/angular/src/app/pages/agents/agents-page.component.html
showcase/angular/src/app/pages/dashboard/dashboard-page.component.html
showcase/angular/src/app/pages/home/home-page.component.html
showcase/angular/src/app/pages/lattice/lattice-page.component.html
showcase/angular/src/app/pages/phantom-stream/phantom-stream-page.component.html
showcase/angular/src/app/pages/privacy/privacy-history-archive.component.html
showcase/angular/src/app/pages/privacy/privacy-page.component.html
showcase/angular/src/app/pages/prometheus/prometheus-page.component.html
showcase/angular/src/app/pages/reference-placeholder/reference-placeholder-page.component.html
showcase/angular/src/app/pages/sitemaps/sitemaps-page.component.html
```

### Doc chunk 9/19 - showcase (2/2 in dir, 7 files)
CHUNK_NUM=9 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_009.json
```
showcase/angular/src/app/pages/stats/stats-page.component.html
showcase/angular/src/app/pages/support/support-page.component.html
showcase/angular/src/index.html
showcase/angular/src/locale/DO-NOT-TRANSLATE.md
showcase/dashboard.html
showcase/privacy.html
showcase/server/data/README.md
```

### Doc chunk 10/19 - skills (1/1 in dir, 10 files)
CHUNK_NUM=10 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_010.json
```
skills/FSB Skill/SKILL.md
skills/FSB Skill/USAGE.md
skills/FSB Skill/references/README.md
skills/FSB Skill/references/default-to-fsb.md
skills/FSB Skill/references/multi-agent-contract.md
skills/FSB Skill/references/restricted-tab-recovery.md
skills/FSB Skill/references/tool-decision-tree.md
skills/FSB Skill/references/vault-boundary.md
skills/FSB Skill/references/visual-session-lifecycle.md
skills/FSB Skill/scripts/README.md
```

### Doc chunk 11/19 - .claude (1/1 in dir, 9 files)
CHUNK_NUM=11 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_011.json
```
.claude/skills/graphify/SKILL.md
.claude/skills/graphify/references/add-watch.md
.claude/skills/graphify/references/exports.md
.claude/skills/graphify/references/extraction-spec.md
.claude/skills/graphify/references/github-and-merge.md
.claude/skills/graphify/references/hooks.md
.claude/skills/graphify/references/query.md
.claude/skills/graphify/references/transcribe.md
.claude/skills/graphify/references/update.md
```

### Doc chunk 12/19 - .github (1/1 in dir, 5 files)
CHUNK_NUM=12 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_012.json
```
.github/FUNDING.yml
.github/workflows/chrome-extension.yml
.github/workflows/ci.yml
.github/workflows/deploy.yml
.github/workflows/npm-publish.yml
```

### Doc chunk 13/19 - (root) (1/1 in dir, 2 files)
CHUNK_NUM=13 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_013.json
```
CHANGELOG.md
README.md
```

### Doc chunk 14/19 - mcp (1/1 in dir, 2 files)
CHUNK_NUM=14 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_014.json
```
mcp/CHANGELOG.md
mcp/README.md
```

### Doc chunk 15/19 - store-assets (1/1 in dir, 2 files)
CHUNK_NUM=15 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_015.json
```
store-assets/chrome-web-store/listing-copy.md
store-assets/chrome-web-store/privacy-practices-evidence.md
```

### Doc chunk 16/19 - docs (1/1 in dir, 1 files)
CHUNK_NUM=16 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_016.json
```
docs/LEGAL.md
```

### Doc chunk 17/19 - server-py (1/1 in dir, 1 files)
CHUNK_NUM=17 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_017.json
```
server-py/requirements.txt
```

### Doc chunk 18/19 - tests (1/1 in dir, 1 files)
CHUNK_NUM=18 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_018.json
```
tests/fixtures/dom-stream-50k.html
```

### Doc chunk 19/19 - vendor (1/1 in dir, 1 files)
CHUNK_NUM=19 TOTAL_CHUNKS=19 CHUNK_PATH=graphify-out/.graphify_chunk_019.json
```
vendor/opentabs-snapshot/PIN.md
```

## Image waves (5 total, 59 images - 513 generic .context extension/PWA icon PNGs excluded per scope decision, real screenshots + product assets only)

### Image wave 1/5 - .context (3 images)
Each file below is its own subagent (vision needs isolated context). CHUNK_PATH=graphify-out/.graphify_chunk_img_01_NN.json
```
.context/attachments/GLyfv3/Screenshot 2026-07-02 at 12.08.39.png
.context/attachments/Il8uZC/Screenshot 2026-06-17 at 11.43.08.png
.context/attachments/olwzvA/Screenshot 2026-06-29 at 03.59.07.png
```

### Image wave 2/5 - extension (15 images)
Each file below is its own subagent (vision needs isolated context). CHUNK_PATH=graphify-out/.graphify_chunk_img_02_NN.json
```
extension/assets/0.9.png
extension/assets/0.9_light.png
extension/assets/fsb.png
extension/assets/fsb_logo_dark.png
extension/assets/fsb_logo_dark_footer.png
extension/assets/fsb_logo_light.png
extension/assets/fsb_logo_light_footer.png
extension/assets/fsb_logo_text.png
extension/assets/icon128.png
extension/assets/icon16.png
extension/assets/icon48.png
extension/assets/onboarding/icon48.png
extension/assets/onboarding/providers/all.svg
extension/assets/onboarding/providers/anthropic.webp
extension/assets/onboarding/providers/claude.svg
```

### Image wave 3/5 - extension (15 images)
Each file below is its own subagent (vision needs isolated context). CHUNK_PATH=graphify-out/.graphify_chunk_img_03_NN.json
```
extension/assets/onboarding/providers/cursor.svg
extension/assets/onboarding/providers/google.png
extension/assets/onboarding/providers/openai.svg
extension/assets/onboarding/providers/openclaw.svg
extension/assets/onboarding/providers/opencode.svg
extension/assets/onboarding/providers/openrouter.svg
extension/assets/onboarding/providers/vscode.svg
extension/assets/onboarding/providers/windsurf.svg
extension/assets/onboarding/providers/xai.png
extension/assets/screenshots/api-configuration.png
extension/assets/screenshots/dashboard-analytics.png
extension/assets/screenshots/demo-task-input.png
extension/assets/screenshots/demo-task-result.png
extension/assets/screenshots/intelligence-graph.png
extension/assets/screenshots/memory-site-explorer.png
```

### Image wave 4/5 - showcase (13 images)
Each file below is its own subagent (vision needs isolated context). CHUNK_PATH=graphify-out/.graphify_chunk_img_04_NN.json
```
showcase/assets/0.9.png
showcase/assets/0.9_light.png
showcase/assets/fsb.png
showcase/assets/fsb_logo_dark.png
showcase/assets/fsb_logo_dark_footer.png
showcase/assets/fsb_logo_light.png
showcase/assets/fsb_logo_light_footer.png
showcase/assets/fsb_logo_text.png
showcase/assets/icon128.png
showcase/assets/icon48.png
showcase/assets/lattice/logo-mark-dark.png
showcase/assets/lattice/logo-mark-spin-dark.gif
showcase/assets/opentabs.svg
```

### Image wave 5/5 - showcase (13 images)
Each file below is its own subagent (vision needs isolated context). CHUNK_PATH=graphify-out/.graphify_chunk_img_05_NN.json
```
showcase/assets/providers/all.svg
showcase/assets/providers/anthropic.webp
showcase/assets/providers/claude.svg
showcase/assets/providers/cursor.svg
showcase/assets/providers/google.png
showcase/assets/providers/hermes.png
showcase/assets/providers/openai.svg
showcase/assets/providers/openclaw.svg
showcase/assets/providers/opencode.svg
showcase/assets/providers/openrouter.svg
showcase/assets/providers/vscode.svg
showcase/assets/providers/windsurf.svg
showcase/assets/providers/xai.png
```
