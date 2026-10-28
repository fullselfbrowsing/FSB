# Pitfalls Research

**Domain:** Adding runtime locale switching to a source-pinned MV3 extension
**Researched:** 2026-10-11
**Confidence:** HIGH

## Pitfalls

### 1. `__MSG_` and `getMessage` ignore the override

**What goes wrong:** The language control appears to work in a unit test of the storage key, while the side panel stays in the browser language.

**Why:** Chrome substitutes `__MSG_key__` and resolves `chrome.i18n.getMessage` from the browser UI language. There is no API to pass a locale.

**Prevention:** Extension UI and overlay chrome go through `t()` / `apply()`. Reserve `__MSG_` for manifest fields, and say so in the phase success criteria. Phase 66.

### 2. Chinese folder names

**What goes wrong:** Catalogs are written to `_locales/zh-CN/` and Chrome never loads them. The UI falls through to English.

**Why:** Chrome's `_locales` folder for Simplified Chinese is `zh_CN`. The public code used everywhere else in this repo is `zh-CN`.

**Prevention:** One mapping function. Tests call it with both forms. Phase 66.

### 3. Missing keys become blank buttons

**What goes wrong:** A new English key ships without a translation, and `getMessage` returns `""`. Buttons render empty.

**Why:** That is the documented `chrome.i18n.getMessage` behavior.

**Prevention:** `t()` falls back to the English message. CI fails when any locale is missing a key or has an empty `message`. Phase 66.

### 4. The copied-English gate fights the extraction order

**What goes wrong:** A phase adds keys to `en` only, and CI goes red. Or the gate is turned off "until translations exist" and stays off.

**Why:** This repo already lived through that on the showcase. Marker presence is not a translation.

**Prevention:** The gate is hard from phase 66, starting on a seed catalog that passes. Later phases add a key to all seven catalogs in the same change, with real translations, not English copies. Phase 70 then audits leftover hardcoded prose.

### 5. Placeholder drift

**What goes wrong:** English says `"Replay speed $SPEED$"` and German drops `$SPEED$`. The button shows the wrong control, or the substitution is appended as junk.

**Prevention:** The verifier compares placeholder tokens per key. Translators may reorder them. They may not add or remove them. Phase 66.

### 6. Source-pin tests

**What goes wrong:** Moving a literal out of `sidepanel.js` or `options.js` fails an existing test that pins that substring.

**Why:** The suite pins exact tokens and substrings on extension source, including UI copy.

**Prevention:** Every extraction phase updates the paired test in the same commit and runs the suite. Do not weaken a pin that guards a protocol string. Phase 67 onward.

### 7. Translating the wire

**What goes wrong:** A helpful pass rewrites an MCP tool description, an error code, a storage key, or a bridge message type.

**Why:** Those strings are identifiers. The paused v0.9.91 milestone's INV-01 still applies: the MCP wire stays byte-stable.

**Prevention:** WIRE-01 is a phase 66 regression check. The verifier's file set is UI catalogs and UI sources, not `mcp/src` tool schemas.

### 8. `importScripts` order

**What goes wrong:** The resolver is appended at the bottom of `background.js`, or inserted in the middle of the Lattice block, and boot order changes.

**Prevention:** Insert one `importScripts('utils/ui-locale.js')` immediately after `install-identity.js`. Leave the rest of the chain alone. Phase 66.

### 9. Overlay text that is not chrome

**What goes wrong:** The overlay translates the user's task title or the model's summary.

**Prevention:** Only FSB-authored labels in `visual-feedback.js` are catalog keys. Payload fields (`p.title`, `p.subtitle`, `p.detail`, capability note text) stay raw. Phase 69.

### 10. Autonyms get translated

**What goes wrong:** The language control shows "Spanish" inside the Spanish UI, or a model translates `日本語` into another language's name for Japanese.

**Prevention:** Autonyms are a fixed map in the resolver, marked as non-translatable data, the same rule the showcase picker uses with `translate="no"`. Phase 71.

### 11. Manifest name mixes brand and version

**What goes wrong:** Translators produce "FSB v0.9.92" variants, or the version is baked into a translatable sentence and goes stale on the next bump.

**Prevention:** `FSB` stays a protected literal. The version stays the manifest `version` field. The description is the translatable sentence. Do not put the version inside the translatable name if a later bump would require six translation edits. Phase 67.

### 12. Parallel language agents

**What goes wrong:** Six agents invent six key names for the same button.

**Prevention:** Key names are frozen in the English file by the phase that owns the surface. A locale agent, if used at all, may edit only `_locales/<folder>/messages.json` after that freeze.

### 13. Destroying the paused milestone

**What goes wrong:** `phases.clear --confirm` deletes `.planning/phases/57-*` through `65-*` while v0.9.91 human UAT is still pending.

**Prevention:** Those directories were moved to `.planning/milestones/v0.9.91-phases/` before this milestone's files were written. `phases.clear` was not run. Backlog `999.1` was put back in `.planning/phases/`. Do not mark v0.9.91 shipped.

## Sources

- Chrome `i18n.getMessage` missing-key behavior, Chrome i18n reference.
- `extension/content/visual-feedback.js` payload vs chrome split, inspected 2026-10-11.
- `extension/background.js` importScripts header.
- Showcase gate history in `.planning/milestones/v1.2.0-research` equivalents and `I18N-BOUNDARIES.md`.
- `gsd-sdk` `phases.clear` deletes every phase directory except `999.x`. That command was not used.
