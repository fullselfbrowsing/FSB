---
phase: 58
slug: cited-ask-decision-policy
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-27
reviewed_at: 2026-08-27T01:18:59-05:00
---

# Phase 58 — UI Design Contract

> Visual and interaction contract for permission-scoped cited questions, evidence-separated answers, and deterministic Document 10 and complex-agreement memo safeguards inside the explicitly invoked Skopeo HUD.

---

## Contract Intent and Boundary

Phase 58 extends the existing Drive/Docs contract rail with one explicit Focused ask state and one cited-answer state. The user asks against either the current agreement/vendor or the explicitly selected enrolled accessible corpus. Each request and result is bound to fresh account, corpus, source-set, revision, context, and generation authority. A prior answer or acknowledgement never authorizes a later request.

The host remains the work surface. Ask, answer, policy, and memo status render inside the existing lifecycle-owned Skopeo Shadow DOM shell. Phase 58 does not create a chatbot sidebar, persistent conversation surface, detached contract application, host-page form, Drive-row decoration, document mutation, source-writing action, notification surface, or new shell/runtime.

Every result leads with one closed answer state: `Answered`, `Review required`, or `Abstained`. Governing evidence and relevant history are separate sections. Material conclusions and exact facts have current validated citations. Conflicts, gaps, policy blockers, and abstention are first-class results rather than footnotes.

Document 10 and complex-memo state are deterministic policy inputs. Model output cannot configure identity, infer applicability, classify complexity, acknowledge review, author a memo, or clear a decision. Informational cited evidence remains visible when a policy safeguard blocks decision clearance, but the blocked state must be unmistakable and no `Cleared` result may appear.

Phase 59 alerts and release-hardening UI remain out of scope.

## Sources and Decision Status

| Source | Decisions carried into this contract |
|--------|--------------------------------------|
| `58-CONTEXT.md` | Focused in-HUD ask, explicit query scope, fresh authorization, evidence-complete material conclusions, fixed answer outcome, evidence/history separation, categorical trust, stable Document 10 identity, current-decision acknowledgement, explicit complex classification, and blocked-clearance behavior |
| `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md` | VIEW-06/07 and POLICY-01/02/03; answers use only accessible evidence, expose citations/conflicts/gaps/abstention, and enforce Document 10 and rare human-memo safeguards |
| Phase 57 approved UI contract | Existing 384px contract rail, folder/reading states, exact citations, policy/memo slots, tokens, geometry, accessibility, collision, and zero-residue teardown |
| Phase 52/53/53.1 UI contracts | One shell, six primitives, four attention levels, exact semantic binding, Focused entry only after user action, closed atoms, and consequence-gate authority |
| Existing implementation | Classic JavaScript shell/composer/runtime; background-only exact-set truth and opaque citation actions; no React, shadcn, or component registry |
| Researcher defaults | Exact ask/result anatomy, copy, local state transitions, density caps, and policy acknowledgement presentation where upstream artifacts granted discretion |

No question remains that requires an additional product decision before planning. Defaults below preserve the accepted Phase 58 decisions and predecessor UI contracts.

---

## Design System

| Property | Contract |
|----------|----------|
| Tool | Existing Skopeo Shadow DOM shell, FSB CSS tokens, and classic/direct JavaScript |
| Preset | Not applicable |
| Component library | None |
| Icon library | Existing CSS geometry or text glyphs only; no page-level icon dependency |
| Body font | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` |
| Instrument font | `"Space Mono", "SF Mono", Monaco, Consolas, monospace`, using the bundled Space Mono assets |
| Styling boundary | The existing single dynamically injected Skopeo Shadow DOM shell |
| Runtime | Manifest V3 Chrome extension, classic JavaScript; no React, Next.js, Vite, JSX, Tailwind, or component framework |

Phase 58 adds closed ask, answer, policy-status, and acknowledgement models to the existing composer and shell. It does not initialize a design system, restyle unrelated FSB surfaces, copy Google visual language, or admit profile-provided HTML/CSS.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | None | Not applicable; repository inspection on 2026-08-27 confirmed this is not a React stack and has no `components.json` |
| Third-party registries | None | No registry, package, block, remote font, icon set, CDN, or remote UI asset is permitted |

---

## Spacing Scale

These inherited tokens are the only spacing values permitted in new Phase 58 UI.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Inline evidence/status gaps, label/value separation |
| `space-2` | 8px | Control gaps, answer-row padding, scope-option spacing |
| `space-4` | 16px | Rail padding, section separation, viewport inset |
| `space-6` | 24px | Conclusion-to-evidence and policy-to-action separation |
| `space-8` | 32px | Major internal separation and compact-control geometry |
| `space-12` | 48px | Maximum short leader/fixture separation only |
| `space-16` | 64px | Lens-to-rail and viewport top/bottom reserve |

Exceptions: none. One- and two-pixel borders/outlines plus control width/height are geometry, not spacing tokens. Ask, citation, scope, review, acknowledgement, and back controls are at least 40px high. The question text area is at least 88px high.

---

## Typography

Use exactly four sizes and two weights. Questions, conclusions, evidence, policy blockers, citations, and controls cannot introduce another size or weight.

| Role | Family | Size | Weight | Exact line height | Usage |
|------|--------|------|--------|-------------------|-------|
| Micro label | Instrument mono | 11px | 700 | 16px | Uppercase answer state, scope, trust, and policy eyebrows |
| Metadata | Instrument mono | 12px | 400 | 16px | Citation locations, evidence role, source state, counts |
| Body/control | System sans | 14px | 400 | 20px | Questions, conclusions, explanations, gaps, controls |
| Title/emphasis | System sans | 16px | 700 | Ask/result title, answer outcome, blocking safeguard |

Micro labels may use uppercase with `letter-spacing: 0.08em`. All other copy is sentence case. Material conclusions, answer state, policy blockers, and specific action labels wrap rather than truncate. Secondary citation metadata may truncate visually only when the complete bounded value remains in its accessible description.

---

## Color

### Skopeo-owned 60/30/10 contract

| Share | Value | Usage |
|-------|-------|-------|
| Dominant 60% | `#0d0a09` | Focused ask and cited-answer rail base |
| Secondary 30% | `#1a1513`; nested neutral `#26201d` | Scope controls, evidence groups, policy cards, neutral wells |
| Accent 10% maximum | `#ff6b35` | Current signals and only the reserved elements below |
| Destructive/error | `#dc2626`; readable dark-surface text `#fca5a5` | Technical failure only; Phase 58 defines no source-destructive action |

Primary text is `#f6efe9`, secondary text `#d2c1b4`, muted metadata `#a99283`, default keyline `rgba(255, 241, 232, 0.18)`, subtle separator `rgba(255, 241, 232, 0.10)`, and shadow `rgba(0, 0, 0, 0.38)`.

Accent is reserved for:

1. the active Skopeo glyph and current rail tick;
2. the visible `:focus-visible` outline;
3. the currently selected ask scope;
4. the one primary `Ask contract question` action before dispatch;
5. the current `Review required` or `Abstained` outcome keyline;
6. one primary `Review Document 10` action when it is the next required safeguard;
7. the current accepted policy acknowledgement indicator.

Orange is not used for every citation, evidence row, gap, historical item, policy status, or control. Missing/inaccessible policy evidence uses explicit text and neutral warning geometry, not success/destructive color. No green clearance color is introduced. `Cleared`, when deterministically authorized, remains a full text state. All meaning survives monochrome and forced colors.

Orange-filled actions use `#0d0a09` text. All text and meaningful geometry meet WCAG 2.2 AA. Forced-colors mode uses system colors and preserves answer/policy state in text.

---

## Attention and Visual Hierarchy

| Admitted condition | Attention | Focal point | Prohibited |
|--------------------|-----------|-------------|------------|
| Current Phase 57 folder/reading projection | Anchored | Existing folder or reading focal point | Automatic ask entry |
| User activates a named ask control | Focused | Exact scope, then labelled question field | Gate, automatic dispatch, inherited conversation |
| Provider/query work is current | Focused neutral | `Checking accessible evidence…` | Retained old answer, animated promise, time estimate |
| Current cited answer | Focused | `Answered`, `Review required`, or `Abstained`, then conclusion | Model score as clearance, blended history/governing evidence |
| Applicable policy safeguard unresolved | Focused | `Decision blocked`, then exact blocker and next action | Hidden cited information, false cleared state |
| Policy configuration confirmation | Interstitial | Exact account/corpus/document or agreement effect | Source mutation, automatic confirmation, unrelated controls |
| Context/permission/generation drift | Ambient fail-quiet or teardown | Existing Phase 53 state | Any stale question, answer, acknowledgement, action, or announcement |

Ask is entered only through an explicit Skopeo control. Content changes, navigation, provider completion, policy discovery, or a configured complex flag never raise attention automatically.

---

## Shared Rail Geometry

Phase 58 reuses the complete Phase 57 rail geometry contract:

| Property | Exact contract |
|----------|----------------|
| Desktop width | 384px |
| Viewport inset | 16px from the right edge |
| Vertical reserve | 64px from top and bottom |
| Maximum height | `calc(100dvh - 128px)` |
| Internal padding | 16px |
| Surface/card radius | 12px |
| Overflow | Internal vertical scroll with `overscroll-behavior: contain`; no horizontal scroll |
| Host clearance | 8px from required visible host controls, focused host element, and scrollbar zone |

Below 480 CSS px, use `left: 16px; right: 16px; width: auto`, keep the 64px vertical reserve, and stack every multi-column row. The same rule applies at 200% zoom. If safe placement cannot be certified, render no partial ask/result surface and show the inherited unsafe-layout status through the trusted extension surface.

Focused ask replaces the contract rail body inside the same shell; it does not stack a second card beside or over the Phase 57 rail. Back restores a freshly projected Anchored folder/reading state, never a cached DOM subtree.

---

## Ask Entry and Composer Contract

### Entry actions

| Context | Exact action | Scope on entry |
|---------|--------------|----------------|
| Current agreement-reading view | `Ask about this agreement` | Current agreement/vendor |
| Current enrolled vendor folder | `Ask enrolled corpus` | Enrolled accessible corpus |
| Current vendor card with exact vendor token | `Ask about {vendor}` | That vendor's exact accessible source set |

The entry action is omitted when the exact scope cannot be certified. It is never shown disabled or derived from a visible filename/folder label alone.

### Focused ask anatomy

Use this fixed order:

1. back action `Back to contract view`;
2. micro eyebrow `ASK CONTRACT EVIDENCE`;
3. title `Ask contract evidence`;
4. exact scope summary, such as `Current agreement · Acme` or `Enrolled accessible corpus`;
5. labelled question field `Question` with helper `Ask about governing terms, exact dates, conflicts, or accessible history.`;
6. scope choices admitted for the current context, using native radio semantics;
7. primary action `Ask contract question`;
8. secondary action `Clear question` only when text exists;
9. bounded privacy note `Skopeo uses only currently accessible evidence for this scope.`

The question field accepts 1–2,000 Unicode scalar values after trim, displays a live count only after 1,800 characters, rejects control/bidi-override characters, and uses plain text only. Enter inserts a newline. `Command+Enter`/`Control+Enter` dispatches only when the button is currently admissible; the shortcut is included in the accessible description and never replaces the visible action.

Changing scope clears any previous answer, acknowledgement, action token, and pending request before the new scope commits. It does not dispatch automatically. A follow-up begins as a new question with fresh authority; previous answer text is not implicitly included in provider context.

### Ask working and failure states

| State | Exact visible copy | Behavior |
|-------|--------------------|----------|
| Current work | `Checking accessible evidence…` | Static text; question and scope become read-only; `Cancel current question` remains available |
| Incomplete relevant set | `Skopeo can show verified evidence, but it can’t support a complete conclusion for this question.` | Route to `Abstained`; retain only current cited facts/gaps |
| Provider unavailable | `Skopeo couldn’t evaluate this question with the configured provider. Check provider settings and ask again.` | No partial model output; specific recovery path |
| Authority changed | `This evidence scope changed. Reopen the contract view and ask again.` | Withdraw result and all actions synchronously |
| Unsafe or malformed question | `Skopeo can’t evaluate this question safely. Rephrase it using contract facts or dates.` | Keep editable question; no provider call when rejected locally |

Cancel ends the current ask generation and returns to the editable focused state with no prior partial response. Back during work cancels first, withdraws the ask surface, then requests a fresh Anchored projection.

---

## Cited Answer Contract

### Fixed section order

1. answer-state banner;
2. `Conclusion`;
3. `Governing evidence`;
4. `Relevant history`, only when current cited history exists;
5. `Conflicts and gaps`;
6. `Policy safeguards`, only when an applicable policy or complex classification exists;
7. `Sources` and exact overflow statement;
8. `Ask another contract question` and `Back to contract view`.

### Answer-state banner

| Closed outcome | Exact label | Explanation rule |
|----------------|-------------|------------------|
| `answered` | `Answered` | `The conclusion below is supported by the complete current accessible evidence for this scope.` |
| `review-required` | `Review required` | `Current evidence contains a conflict or policy safeguard that requires human review before a decision can be cleared.` |
| `abstained` | `Abstained` | `Skopeo can’t support a material conclusion from the complete current accessible evidence.` |

No answer state uses a percentage or model score. Categorical trust appears as full words with a bounded explanation. `Answered` does not mean a decision is cleared; clearance is a separate deterministic policy state.

### Conclusion and evidence

- A material conclusion is at most 1,200 characters and cannot appear under `abstained`.
- `Review required` may show a bounded non-cleared conclusion only when every material sentence has governing citations and the blocker is explicit.
- Every material conclusion maps to at least one exact current citation. An uncited sentence is omitted rather than rendered as a conclusion.
- Governing evidence and relevant history use separate lists. A single evidence row cannot occupy both roles.
- Each row contains a bounded claim label, value, evidence role, categorical trust state, source/citation label, and neutral `Open source for {claim label}` button when a current action token exists.
- Direct source actions reuse Phase 57 one-shot `citation-open`; content never receives a URL, file ID, account ID, source key, revision key, or registry record.
- Display at most 8 governing rows, 6 historical rows, 8 conflicts/gaps, and 12 source/citation rows. Exact overflow copy states how many items are omitted and never describes the visible prefix as complete.

### Conflicts and gaps

Use closed, full-word labels including `Evidence conflict`, `Source inaccessible`, `Source unreadable`, `Index incomplete`, `Governing state review required`, `Document 10 missing`, `Document 10 inaccessible`, `Required memo missing`, and `Required memo inaccessible`. Absence is reported only from a complete authoritative set. Raw enum/reason codes never render.

---

## Document 10 Policy Contract

### Configuration

Document 10 is a stable configured Drive identity in the current account/corpus partition. Configuration is available only from an exact current Drive/Docs document through `Use this document as Document 10`. The action opens the existing Interstitial consequence gate with:

- eyebrow `POLICY CONFIGURATION`;
- title `Configure Document 10`;
- exact bounded document label;
- exact current corpus label when disclosure is authorized;
- effect `Future applicable decisions will require review of this document’s current accessible revision.`;
- safe return `Keep current policy document`;
- confirmation `Configure Document 10`.

Background re-derives the current stable file identity; content never supplies or stores it. Replacing or clearing the configuration requires an equally explicit local confirmation. Configuration does not mutate Drive content.

### Applicable decision safeguard

| State | Visible result | Available action |
|-------|----------------|------------------|
| Not applicable | Omit the Document 10 safeguard | None |
| Applicable and current, not reviewed | `Decision blocked · Review Document 10` | `Review Document 10` |
| Review opened, acknowledgement pending | `Document 10 opened for this decision` | `I reviewed Document 10` |
| Current acknowledgement accepted | `Document 10 reviewed for this decision` | Current acknowledgement indicator; no repeat action |
| Missing | `Decision blocked · Document 10 is missing` | `Configure Document 10` when exact current candidate exists |
| Inaccessible | `Decision blocked · Document 10 isn’t accessible with the current account` | `Recheck Document 10 access` |
| Stale/revision changed | `Decision blocked · Document 10 changed since review` | `Review current Document 10` |

`I reviewed Document 10` is available only after the current accessible revision was opened through a fresh one-shot action for the current decision. It records acknowledgement, not agreement or legal approval. Any revision, account, corpus, access, scope, question, decision-kind, or authority change withdraws it before repaint.

No informational evidence is hidden by this gate. A decision-clearance row appears separately as `Blocked` or `Cleared`; it never inherits the answer outcome or model language.

---

## Complex-Agreement Memo Contract

Only an exact current agreement may expose `Classify this agreement as complex`. This local policy change uses an Interstitial confirmation naming the bounded agreement label and effect: `A current human-authored memo will be required before applicable decisions can be cleared.` Confirmation is `Classify as complex`; safe return is `Keep routine classification`.

Routine agreements omit the memo-requirement row entirely. They do not show `Not required`, `Not evaluated`, or any other memo-obligation status. Existing memo evidence also remains omitted from the Phase 58 policy section unless the agreement is explicitly complex.

For a current complex agreement, use exactly these user-facing states:

| Authority result | Visible copy | Clearance effect |
|------------------|--------------|------------------|
| Complete current memo relation | `Human-authored memo on file` | Memo safeguard satisfied |
| Complete current set proves absence | `Decision blocked · Required human-authored memo is missing` | Blocked |
| Required memo source inaccessible | `Decision blocked · Required memo isn’t accessible` | Blocked |
| Evidence incomplete or stale | `Decision blocked · Memo status requires review` | Blocked |

Skopeo never offers `Draft memo`, `Generate memo`, `Complete memo`, or source mutation. A current memo citation may expose `Open human-authored memo` through the existing one-shot citation action.

Removing the complex classification requires a confirmation that explains it removes the Skopeo memo safeguard for future decisions; it never deletes or edits a memo source.

---

## Copywriting Contract

| Element | Exact copy or closed template |
|---------|-------------------------------|
| Primary ask CTA | `Ask contract question` |
| Agreement entry | `Ask about this agreement` |
| Corpus entry | `Ask enrolled corpus` |
| Vendor entry | `Ask about {vendor}` |
| Empty answer heading | `No supported conclusion` |
| Empty answer body | `Skopeo found no complete current evidence that supports a material conclusion. Review the listed gaps or ask a narrower contract question.` |
| Provider error | `Skopeo couldn’t evaluate this question with the configured provider. Check provider settings and ask again.` |
| Authority error | `This evidence scope changed. Reopen the contract view and ask again.` |
| Policy blocker | `Decision blocked` plus the exact Document 10 or memo reason |
| Ask again | `Ask another contract question` |
| Back action | `Back to contract view` |
| Clear field | `Clear question` |
| Cancel work | `Cancel current question` |
| Document review | `Review Document 10` |
| Review acknowledgement | `I reviewed Document 10` |
| Policy configuration | `Configure Document 10` |
| Complex classification | `Classify as complex` |
| Destructive confirmation | None; Phase 58 does not delete or mutate a Drive source |

Standalone `Submit`, `OK`, `Continue`, `Go`, `Open`, `View`, `Retry`, `Save`, and `Click here` are prohibited. Error copy always states both the problem and a safe next step. No copy says an answer is legal advice, a model is confident, a policy review happened automatically, or Skopeo authored a memo.

---

## Interaction and State Transitions

```text
ANCHORED FOLDER/READING
  └─ explicit named ask action → FOCUSED ASK
       ├─ scope/question edit → FOCUSED ASK (no effect)
       ├─ Ask contract question → CHECKING
       │    ├─ complete current cited result → ANSWERED / REVIEW REQUIRED / ABSTAINED
       │    ├─ provider failure → FOCUSED ERROR
       │    └─ authority drift → withdraw → inherited fail-quiet
       ├─ Back → cancel/withdraw → fresh ANCHORED projection
       └─ Escape → fresh ANCHORED projection

ANSWER RESULT
  ├─ citation action → fresh source authorization → new foreground tab / typed failure
  ├─ applicable Document 10 review → open current source → acknowledge / blocked
  ├─ Ask another contract question → new empty FOCUSED ASK
  └─ Back → fresh ANCHORED projection

POLICY CONFIGURATION
  ├─ safe return → prior current surface
  └─ confirm → fresh background re-derivation → new current projection / typed failure

ANY ACTIVE
  └─ Turn off or Escape Escape → OFF with exact teardown
```

- Navigation never invokes Ask or replays a question.
- Ask replacement withdraws all previous conclusions, citations, acknowledgements, and actions before work begins.
- Provider completion after cancel, scope change, kill, navigation, permission change, or generation replacement has zero visible or durable effect.
- `Ask another contract question` begins with an empty question and no inherited answer authority.
- Browser Back/Forward and same-document navigation re-enter only through a freshly certified context and projection.

---

## Motion and Feedback

| Transition | Timing |
|------------|--------|
| Anchored rail to Focused ask/result | 120ms ease-out opacity plus at most 4px translation |
| Answer/policy state replacement | Immediate after withdraw-first commit; one polite announcement |
| Scope change | Immediate content replacement; no carousel motion |
| Collision reposition | 120ms ease-out |
| Cancel, close, kill, navigation, permission withdrawal, stale replacement | Synchronous removal; no exit animation |
| Loading | Static text only; no spinner, shimmer, pulse, progress percentage, or time promise |

Under `prefers-reduced-motion: reduce`, all durations are 0ms. Motion never expresses trust, confidence, completeness, clearance, or urgency.

---

## Keyboard, Focus, and Accessibility

- Entering Focused ask from a Skopeo control moves focus to the labelled `Question` field without scrolling the host page.
- Back, scope radios, question field, ask/clear/cancel actions, result actions, citations, policy controls, and turn-off controls follow DOM order.
- `Escape` from the text field closes the Focused ask only when not composing text with an IME; inherited double-Escape remains the current-tab kill.
- The result region receives programmatic focus only after explicit dispatch and final state commit. It has `role="region"`, `tabindex="-1"`, and a name containing the closed answer state.
- `Answered`, `Review required`, `Abstained`, `Decision blocked`, and current policy acknowledgement are expressed in text and announced once through the existing atomic polite live region. Technical failure may use `role="alert"` only when user action just failed.
- Scope uses native `fieldset`/`legend` and radio semantics. Policy acknowledgements use native buttons, not checkboxes that imply persistent consent.
- Evidence uses headings and lists; each citation button's accessible name includes the exact claim label and evidence role.
- Opening a source preserves the current HUD state and does not move focus into the new tab until Chrome activates it as the user-requested foreground effect.
- Returning from a source does not claim review automatically; the explicit current acknowledgement remains required.
- At 200% zoom and below 480px, every question, evidence row, blocker, policy control, and source action remains reachable without Skopeo-caused horizontal page scroll.
- Forced colors and reduced motion preserve all meaning. No state relies on hue, border position, glyph, or animation alone.

---

## Host Integrity, Trust, and Failure States

1. Render only inside the existing Shadow root and resource ledger; do not add a host node per question, claim, citation, policy, or memo.
2. Render every question, answer, source label, policy label, and hostile string through `textContent`; no `innerHTML`, Markdown execution, SVG string, remote image, iframe, or host node.
3. Content receives no raw source text, provider response, prompt, tab/account/corpus/file/source/storage identity, URL, revision key, graph/truth record, policy rule, or private facade.
4. Every query result rechecks generation, exact origin, profile version, context epoch, semantic entity, exact scope, source-set digest, request token, and projection token immediately before commit.
5. Every citation, policy review, acknowledgement, configuration, and classification effect repeats fresh account/corpus/source/access/revision/decision authority immediately before the effect.
6. Provider work uses one configured FSB provider/model with bounded inert excerpts. It receives no tools, storage, source URL, policy authority, or ability to declare citation IDs, applicability, complexity, review, or clearance.
7. A material conclusion requires the complete relevant current accessible evidence set. Partial current facts may remain only under `Abstained` with exact gaps and citations.
8. Inaccessible identities outside current disclosure authority are omitted without labels, counts, or gaps that reveal existence.
9. Policy configuration and complex classification are local policy effects through exact-key background actions; they never mutate Drive documents.
10. Close, kill, navigation, identity drift, permission withdrawal, scope change, request replacement, and shell disposal synchronously remove questions, results, provider work, actions, acknowledgements, listeners, focus hooks, and announcements.

### Failure-state hierarchy

| Failure | Visible result | Required guarantee |
|---------|----------------|--------------------|
| Relevant exact set incomplete/over cap | `Abstained` plus exact gap/overflow | No material conclusion from a prefix |
| Provider unavailable or malformed output | Specific configured-provider error | No partial output or alternate provider |
| Conflicting governing evidence | `Review required` plus separated conflict evidence | No cleared decision |
| Fake/invalid citation | Omit affected claim; abstain when material | No source action or guessed locator |
| Document 10 missing/inaccessible/stale | `Decision blocked` plus exact reason | Informational cited evidence remains; clearance absent |
| Required memo missing/inaccessible/stale | `Decision blocked` plus exact reason | No routine-agreement memo implication |
| Current access fails | Exact access blocker or complete withdrawal | No hidden identity/source leak |
| Stale response/context drift | Immediate result withdrawal | No stale repaint, acknowledgement, or announcement |
| Replayed/revoked action | Exact typed failure | No tab/config/classification effect |
| Unsafe geometry | Trusted unsafe-layout copy; no rail | No host-control obstruction or partial surface |

---

## Verification and Visual QA Contract

Record Skopeo-owned output at normal width, below 480 CSS px, 200% zoom, reduced motion, high contrast, and forced colors for:

1. agreement-scoped ask entry, corpus-scoped ask entry, and vendor-scoped ask entry;
2. empty, near-cap, exact-cap, unsafe, multiline, and hostile question text;
3. `Answered` with governing evidence, relevant history, exact facts, and citations;
4. `Review required` with conflicting evidence and no false clearance;
5. `Abstained` with partial current facts, explicit gaps, and no material conclusion;
6. exact evidence/source overflow at max and max-plus-one;
7. provider unavailable, malformed output, cancellation, late completion, and configured-provider drift;
8. fake citation, hostile source instructions, cross-vendor reference, and inaccessible-source negative cases;
9. Document 10 unconfigured, current, opened-not-acknowledged, acknowledged, revision-changed, missing, inaccessible, and replaced;
10. complex flag absent, present with memo on file, proven missing, inaccessible, incomplete, and classification removal;
11. answer/citation/policy action stale token, replay, cross-tab use, account change, corpus change, source revision drift, and access revocation;
12. keyboard/IME, VoiceOver, focus restoration, live-region deduplication, collision rejection, navigation, kill, and exact zero-residue teardown.

### Acceptance checklist

- [ ] Ask is explicit, Focused, and contained inside the one current Skopeo HUD.
- [ ] Scope is visible and explicit; no question silently expands from vendor/agreement to corpus.
- [ ] Every request receives fresh current authority and no follow-up inherits answer authority.
- [ ] Answer state, conclusion, governing evidence, history, conflicts/gaps, policy safeguards, and sources remain structurally distinct.
- [ ] Every material conclusion and exact fact has a current validated citation.
- [ ] Incomplete relevant evidence produces `Abstained`, never a qualified material guess.
- [ ] Document 10 uses stable current identity, requires current review plus acknowledgement, and blocks clearance when missing/inaccessible/stale.
- [ ] Routine agreements show no memo-requirement status; only explicitly complex agreements receive human-memo safeguards.
- [ ] Skopeo never drafts, generates, mutates, or claims authorship of a memo.
- [ ] No numeric model score controls trust or clearance.
- [ ] Provider, source, citation, policy, and memo inputs remain untrusted and bounded.
- [ ] 200% zoom, narrow layout, keyboard, VoiceOver, forced colors, and reduced motion preserve all content and actions.
- [ ] Turning Skopeo off restores exact zero visual, DOM, provider-work, listener, focus, action-token, acknowledgement, and announcement residue.

Human approval remains required for counsel/legal-operations semantics, policy applicability rules, complex-agreement classification practice, and representative authorized Drive/Docs source navigation. Synthetic evaluation may verify structure and safety but cannot manufacture legal approval or live access evidence.

---

## Traceability

| Source | UI contract coverage |
|--------|----------------------|
| VIEW-06 | Explicit vendor/agreement/corpus ask scope, current-access query states, answer/abstention interaction |
| VIEW-07 | Fixed answer hierarchy, governing/history separation, categorical trust, conflicts, gaps, citations, and direct source navigation |
| POLICY-01 | Stable configured Document 10 identity, visible applicable-review flow, current acknowledgement |
| POLICY-02 | Missing/inaccessible/stale Document 10 blocker with no cleared decision |
| POLICY-03 | Explicit complex classification, routine omission, human-authored memo states, missing/inaccessible blocker, no authoring |
| `58-CONTEXT.md` | All 17 accepted ask, evidence, Document 10, and memo decisions |
| Phase 52/53/53.1/57 contracts | Reused tokens, shell, attention, geometry, semantic binding, citations, accessibility, host integrity, and teardown |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-08-27
