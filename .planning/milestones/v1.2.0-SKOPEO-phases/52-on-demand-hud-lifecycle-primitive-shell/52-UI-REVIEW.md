# Phase 52 — UI Review

**Audited:** 2026-07-18
**Baseline:** 52-UI-SPEC.md (approved)
**Screenshots:** Not captured. Playwright-MCP was unavailable; port 3000 returned a non-auditable HTTP 401, ports 5173 and 8080 were unreachable, and Phase 52 is an unpacked Chrome-extension surface rather than a served page.
**Audit mode:** Code-only. Findings explicitly distinguish code-verifiable defects from live visual items that remain unverified.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Required state copy and accessible names are present, but the Ambient close has no visible tooltip. |
| 2. Visuals | 2/4 | The compact lens can overflow, and the controlled anchor and halo do not match their required visual geometry or motion. |
| 3. Color | 2/4 | Accent is used on an undeclared decorative row border, while forced colors turns the halo into a solid block. |
| 4. Typography | 2/4 | Space Mono is referenced but not loaded in either Phase 52 surface, and side-panel body copy uses the metadata style. |
| 5. Spacing | 2/4 | The declared scale is mostly followed, but the mandatory 88px fallback has no mode-specific content fit treatment. |
| 6. Experience Design | 3/4 | State, focus, teardown, and fail-closed mechanics are strong; compact collision safety and all live extension checks remain unproven. |

**Overall: 14/24**

**Severity summary:** 0 BLOCKER findings; all defects below are WARNING findings because they degrade contract fidelity or live confidence without proving that the core on/off task is impossible.

---

## Top 3 Priority Fixes

1. **Make compact mode genuinely fit inside its measured 88×40px rectangle** — The current wide-viewport collision fallback can paint children outside the area that was checked for host-control overlap. Add data-placement-mode="compact" rules that remove visual metadata and any nonessential visible label while preserving the full status in an accessible name; then assert computed child bounds and overflow in a real browser at both sides of the 480px breakpoint.
2. **Rebuild the controlled anchor and anomaly primitives to the approved geometry** — Put an 8×8 keylined mark inside the 32×32 anchor button, keep its visible fixture label outside the mark, wrap the semantic anomaly payload with the single halo, restore the one-shot 240ms ease-out bloom through a ledger-owned animation, and render only a 2px Highlight outline in forced colors.
3. **Load and apply the bundled instrument font deliberately** — Declare the bundled 400/700 Space Mono faces in the side panel and provide a reliable extension-owned font-loading path for the closed Shadow DOM. Split skopeo-control-body from the mono 12px hint rule so descriptions/status bodies use the specified 14px system-sans role.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **WARNING — code-verifiable:** The approved copy table requires an Ambient close tooltip reading “Turn off Skopeo” (52-UI-SPEC.md:297-305). The button factory supplies only aria-label (extension/content/skopeo-shell.js:1319-1323), and the Ambient renderer adds no title or visible tooltip (extension/content/skopeo-shell.js:1789-1798). The accessible name is correct, but mouse and sighted-keyboard users receive no tooltip. Add a native title or a tested custom tooltip without changing the accessible name.
- **Contract evidence:** Page copy is centralized and matches the approved strings (extension/content/skopeo-shell.js:123-145). Side-panel Off, Starting, Active, unsupported, unsafe-layout, and start-error copy also matches the contract (extension/ui/sidepanel.js:255-321), and rendering preserves the status/body/action separation (extension/ui/sidepanel.js:339-365).
- **Live visual item — unverified:** No extension screenshot was available to confirm that long error and shortcut strings remain visually legible at narrow panel widths. This item needs human review; it is not reported as a code defect.

### Pillar 2: Visuals (2/4)

- **WARNING — code-verifiable:** Compact placement is 88×40px (extension/content/skopeo-shell.js:43-44), but the lens always renders glyph, visible status, “Esc Esc” metadata, and a 32px close button (extension/content/skopeo-shell.js:1775-1805). Its flex layout also keeps 8px gaps and 8px inline padding (extension/content/skopeo-shell.js:209-251,270). Metadata is hidden only below 480px (extension/content/skopeo-shell.js:525-530), even though compact mode can be selected at wider viewports after all 240px candidates collide (extension/content/skopeo-shell.js:1083-1102). With border-box sizing, the 88px lens has 70px of inner width; glyph, close, and three gaps already consume 64px before the intrinsic metadata and label. This can overflow or overlap a host control outside the rectangle that collision logic approved.
- **WARNING — code-verifiable:** The fixture anchor is a 32×32 button whose border is itself the mark and whose content is the full “Anchor demo” label (extension/content/skopeo-shell.js:301-310,1811-1814). The contract instead requires an 8×8 visible square inside a 32×32 interactive wrapper (52-UI-SPEC.md:138-145). There is no inner 8×8 fixture mark, and the label cannot reliably fit the button.
- **WARNING — code-verifiable:** The halo is a separate 32×32 flex-row sibling immediately before the anomaly payload (extension/content/skopeo-shell.js:291-300,332-350,1820-1834), rather than an outline around that semantic payload as required by 52-UI-SPEC.md:143-145 and 263-265.
- **WARNING — code-verifiable:** The approved one-shot 240ms halo bloom is absent (52-UI-SPEC.md:198-206). The implementation has only a static border/glow (extension/content/skopeo-shell.js:332-339), and the accessibility test explicitly asserts that no halo bloom exists (tests/skopeo-accessibility.test.js:532-538). Continuous animation is correctly absent, but removing the specified one-shot entry motion is still a contract deviation.
- **Contract evidence:** Normal Ambient creation contains only the lens and rail (extension/content/skopeo-shell.js:1775-1805), the close has the required 32px geometry (tests/skopeo-accessibility.test.js:90-100), and focused/interstitial hierarchy uses named region and alertdialog surfaces (extension/content/skopeo-shell.js:1858-1911).

### Pillar 3: Color (2/4)

- **WARNING — code-verifiable:** The bounded Phase 52 side-panel block contains five #ff6b35 declarations. Four serve declared active-switch or focus roles (extension/ui/sidepanel.css:331-349); the fifth mixes orange into the entire active row border (extension/ui/sidepanel.css:362-364). The approved palette reserves orange for the checked track, active glyph/rail, focus, anchor, halo, and gate keyline, and explicitly excludes decorative borders (52-UI-SPEC.md:97-103). Remove the active-row accent border and retain a neutral existing-token border.
- **WARNING — code-verifiable:** In forced colors, skopeo-halo shares a selector that applies background: Highlight (extension/content/skopeo-shell.js:541-556). This produces a solid Highlight block, not the required 2px Highlight outline plus visible anomaly label (52-UI-SPEC.md:250-259). Give the halo an outline/border-only forced-colors rule and reserve the solid Highlight background for the active glyph/tick.
- **WARNING — code-verifiable:** The gate eyebrow is orange text (extension/content/skopeo-shell.js:386-395), although the contract grants the gate an orange semantic keyline, not accent-colored ordinary labels (52-UI-SPEC.md:97-103). Keep the gate border as the signal and use an approved text token for the eyebrow.
- **Live visual item — unverified:** The intended 60/30/10 visual balance, contrast over light and dark host pages, and increased-contrast rendering require live inspection. No screenshot or OS rendering evidence was available, so these are marked needs_human_review rather than passed.

### Pillar 4: Typography (2/4)

- **WARNING — code-verifiable:** Both Phase 52 surfaces reference “Space Mono” (extension/content/skopeo-shell.js:244-250,386-395,464-469; extension/ui/sidepanel.css:261-268), but neither loaded style context declares an @font-face. The side panel loads only the shared core, sidepanel, and markdown styles (extension/ui/sidepanel.html:6-9), while the bundled files exist at extension/assets/onboarding/fonts/space-mono-400.ttf and space-mono-700.ttf. The Shadow DOM also has no extension-owned face declaration or font-loading call, and the fonts are not exposed by the manifest resource list (extension/manifest.json:53-57). The required instrument face therefore falls back unless the host OS/page happens to supply it, contrary to 52-UI-SPEC.md:34.
- **WARNING — code-verifiable:** skopeo-control-body and skopeo-control-hint share the 12px/400 mono metadata rule (extension/ui/sidepanel.css:261-268). Error and unsupported bodies are descriptions (extension/ui/sidepanel.js:258-267,302-320), so they should use the 14px/400 system-sans Body/control role specified by 52-UI-SPEC.md:73-78. Keep only the shortcut hint in the metadata role.
- **Contract evidence:** The page shell limits declared font sizes to 11, 12, 14, and 16px and weights to 400/700; the focused contract test verifies that distribution (tests/skopeo-accessibility.test.js:540-544). The type scale itself is disciplined even though the instrument face and one semantic role are incorrect.

### Pillar 5: Spacing (2/4)

- **Contract evidence:** The spacing scale is internally consistent in the ordinary side-panel row: 8px block/16px inline padding, 8px gap, 16px gutters, and 64px minimum height (extension/ui/sidepanel.css:205-223). The switch also matches its 44×40px target and 40×24px track (extension/ui/sidepanel.css:295-339).
- **WARNING — code-verifiable:** The mandatory compact fallback does not adapt its child spacing/composition to the 88px width. At a wide viewport, 16px horizontal padding, 8px glyph, 32px close, and three 8px flex gaps leave only 6px before label and metadata; the only metadata-hiding rule is viewport-based rather than placement-mode-based (extension/content/skopeo-shell.js:209-251,270,525-530). This is a functional spacing/fit failure in the exact collision path covered only for outer lens width by tests/skopeo-shell-contract.test.js:1057-1066. Add computed overflow and child-bounds assertions, not merely a style.width assertion.
- **Scope note:** Current-head adaptive compositor styles include 12px gap/padding values at extension/content/skopeo-shell.js:472-480. Those capabilities were introduced after Phase 52 and are not charged to this Phase 52 primitive-shell score; they should be assessed against their owning phase contract.

### Pillar 6: Experience Design (3/4)

- **Contract evidence:** The side panel implements explicit Off, Starting, Active, unsupported, unsafe-layout, and retryable error states with busy, disabled, checked, and live-region semantics (extension/ui/sidepanel.js:255-365). The native switch and initial descriptive wiring are present directly after the header (extension/ui/sidepanel.html:43-58). Focus order/restoration, Escape behavior, live cadence, and teardown are exercised in tests/skopeo-accessibility.test.js:146-187,242-267,401-476. The session lifecycle also verifies abort-before-destroy and an exact eleven-category zero terminal snapshot (tests/skopeo-session-lifecycle.test.js:2148-2181).
- **WARNING — code-verifiable:** Collision logic reasons about an 88px compact rectangle, but the rendered children can exceed it. That mismatch can obscure or intercept a host control the placement algorithm considered safe, weakening the core “do not cover the page” experience even though corner ordering and fail-closed selection are tested (extension/content/skopeo-shell.js:1075-1103; tests/skopeo-shell-contract.test.js:1038-1073).
- **WARNING — live visual unverified:** 52-VERIFICATION.md remains status: human_needed with 0/15 live UAT rows passed (52-VERIFICATION.md:4-8,25-28). It explicitly says controlled fixtures do not prove unpacked-extension commands, real Drive/Docs coexistence, VoiceOver, OS preference rendering, MV3 suspension, or final residue evidence (52-VERIFICATION.md:211-229). These items remain needs_human_review and prevent a 4/4; this review does not convert automated success into live approval.
- **Focused checks run for this audit:** skopeo-shell-contract, skopeo-accessibility, skopeo-sidepanel-command, skopeo-browser-contract, and skopeo-session-lifecycle all passed. These checks support the mechanics score but do not invalidate the code-level visual defects above; notably, the current accessibility test codifies the missing halo bloom.

---

## Audit Coverage and Limitations

- The required .planning/ui-reviews/.gitignore screenshot guard exists and covers PNG, WebP, JPEG, GIF, BMP, and TIFF files. No screenshot artifact was created.
- Playwright-MCP was unavailable. No existing auditable Phase 52 server was reachable on the permitted ports, and no server was started.
- Live appearance on ordinary Web, Drive, and Docs pages; actual 60/30/10 balance; narrow/zoomed rendering; keyboard focus visibility; VoiceOver; forced colors; increased contrast; and reduced motion remain unverified.
- Registry safety was not applicable: components.json is absent and the approved UI-SPEC declares no shadcn or third-party registry dependency.

---

## Files Audited

- extension/content/skopeo-shell.js
- extension/content/skopeo-runtime.js
- extension/ui/sidepanel.html
- extension/ui/sidepanel.css
- extension/ui/sidepanel.js
- extension/background.js
- extension/manifest.json
- extension/assets/onboarding/fonts/space-mono-400.ttf
- extension/assets/onboarding/fonts/space-mono-700.ttf
- tests/skopeo-shell-contract.test.js
- tests/skopeo-accessibility.test.js
- tests/skopeo-sidepanel-command.test.js
- tests/skopeo-browser-contract.test.js
- tests/skopeo-session-lifecycle.test.js
- tests/helpers/skopeo-resource-ledger.js
- .planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-01-PLAN.md through 52-12-PLAN.md
- .planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-01-SUMMARY.md through 52-12-SUMMARY.md
- .planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-UI-SPEC.md
- .planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-CONTEXT.md
- .planning/milestones/v1.2.0-SKOPEO-phases/52-on-demand-hud-lifecycle-primitive-shell/52-VERIFICATION.md
