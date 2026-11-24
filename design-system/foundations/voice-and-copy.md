# Voice and copy

Confident, technical, specific. Make a claim, then back it.

## Rules

- **Declarative confidence.** Short, certain claims. *"Better than all of them. Without vision."*
- **Benefit first, proof second.** Pair each claim with a mechanism or a number, and take the number from its source of truth:
  - the benchmark comes from `showcase/angular/src/app/core/seo/online-mind2web.json`;
  - versions come from `package.json`.

  **MUST NOT** type a version, a count of tools or a benchmark figure into a page by hand; tests pin several of them to their sources.
- **Staccato rhythm** for emphasis, sparingly. *"Faster. Cheaper. More accurate."*
- **Second person, active.** Speak to the user. *"Tell it what to do, and watch it browse for you."*
- **Casing.** Sentence case for headings, buttons and labels. Uppercase is only for eyebrows, footer column titles and the `recommended` flag, always letter-spaced.
- **MUST** set product names, model names, selectors, tool calls and version strings in mono, and mark them `translate="no"`.
- **MUST NOT** use emoji.
- **Feedback:**
  - a toast confirms an action that leaves no visible trace (copied, saved);
  - failures go inline, next to the control that failed, and say what to do next.

Do: "It reads the actual DOM. No vision model needed." It names a concrete mechanism.
Don't: "Our innovative solution leverages cutting-edge synergies for blazing-fast performance." This is vague hype with nothing to check.

## Tokens

None. Copy rules are enforced by the i18n tooling:

- **Extension:**
  - Every UI string comes from `extension/_locales/*/messages.json` through `data-i18n` or a locale helper.
  - `scripts/verify-extension-copy.mjs` fails on uncatalogued English in the in-scope UI files.
  - Identifiers in content scripts must not look like sentences (use kebab-case), or the gate flags them.
- **Showcase:**
  - Templates carry Angular i18n markers, which `lint:i18n` checks in CI.
  - Terms that stay English are listed in [DO-NOT-TRANSLATE.md](../../showcase/angular/src/locale/DO-NOT-TRANSLATE.md).
  - Marker attributes must be valueless.

## Specimens

None. The components' usage notes carry copy examples, for example [Button](../components/core/Button.prompt.md) and [Toast](../components/feedback/Toast.prompt.md).

## Known gaps

- The control panel's `.status-toast` has error variants, against the "toasts never carry errors" rule.
- There is no written glossary for English UI terms beyond DO-NOT-TRANSLATE.md and the brand-term list in `verify-translation-quality.mjs`.

## Evidence

- [scripts/verify-extension-copy.mjs](../../scripts/verify-extension-copy.mjs) `SCOPE`
- [showcase/angular/src/locale/DO-NOT-TRANSLATE.md](../../showcase/angular/src/locale/DO-NOT-TRANSLATE.md), [I18N-BOUNDARIES.md](../../showcase/angular/src/locale/I18N-BOUNDARIES.md)
- [showcase/angular/scripts/verify-translation-quality.mjs](../../showcase/angular/scripts/verify-translation-quality.mjs) `INVARIANT_TECHNICAL_LITERALS`
- [tests/mcp-version-parity.test.js](../../tests/mcp-version-parity.test.js) (counts and versions pinned to their sources)
