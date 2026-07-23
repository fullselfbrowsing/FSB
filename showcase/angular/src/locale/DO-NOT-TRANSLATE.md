# Do Not Translate -- showcase/angular i18n

This list is the authoritative source of terms that MUST NOT be translated when
preparing the per-locale XLIFF targets (messages.es.xlf, .de.xlf,
.ja.xlf, .zh-CN.xlf, .zh-TW.xlf). When any of these appear inside a translatable
string, they are wrapped in `<span translate="no">...</span>` in the source HTML
so the XLIFF extractor preserves them as `<ph>` placeholders the translator must
keep verbatim.

**Marking discipline:** brand names inside prose are wrapped inline;
code identifiers and CLI commands inside `<code>` are protected by `translate="no"`
on the `<code>` element itself. The default Angular i18n extractor preserves
`<ph>` placeholders for both forms.

**Lint-rule note (Plan 262-01 deviation, carries forward):** the project's
`@angular-eslint/template/i18n` rule runs with `checkAttributes: true` and flags
the static literal `translate="no"` on translatable elements as a missing
`i18n-translate` attribute (no such i18n semantic exists). Source HTML therefore
uses the equivalent property-binding form `[attr.translate]="'no'"` whenever the
translate attribute sits on an element that also carries an `i18n` marker. The
rendered DOM attribute is identical (`translate="no"`) and the W3C semantics
are preserved.
For plain wrapper spans whose only role is to opt out of translation (no `i18n`
attribute on the same element), the static form `<span translate="no">...</span>`
remains correct and is preferred.

Do not put `translate="no"` on a large mixed prose-and-code element. In
particular, setting `[attr.translate]="'no'"` on the same element as an `i18n`
marker does not create a protected inner XLIFF placeholder. Split large messages
into focused translatable units, protect each literal inline, and exclude a
whole element only when all of its content is genuinely invariant.

## Brand and product names (alphabetized)

- AI
- Anthropic
- Brave
- BSL 1.1
- CDP
- Chrome
- Chrome DevTools
- Chrome DevTools Protocol
- Chrome Web Store
- Chromium
- CID
- ClawHub
- Claude
- Claude Code
- Claude Desktop
- Claude Haiku 4.5
- Claude Opus 4.1
- Claude Opus 4.6
- Claude Opus 4.7
- Claude Routines
- Claude Sonnet 4.5
- Codex
- Codex MCP
- Computer Use
- CSSOM
- CSRF
- Cursor
- CVV
- Discord
- DOM
- DSSE
- Edge
- Ed25519
- ESM
- Firefox
- FSB
- Full Self-Browsing
- GDPR
- fsb-mcp-server
- Gemini
- GitHub
- Google
- Google Gemini
- Grok
- Grok 4.1
- Grok 4.1 Fast
- Grok Code Fast
- Hermes
- Issues
- JavaScript
- JCS
- JSON
- Lakshman Turlapati
- Lattice
- LiteLLM
- LM Studio
- LZ-string
- MCP
- MCP server
- MutationObserver
- MV3
- npm
- Node
- npx
- OpenAI
- OpenAI Whisper
- OpenClaw
- OpenCode
- OpenRouter
- Opera
- Operator
- PhantomStream
- Playwright
- Project Mariner
- Prometheus
- pnpm
- Remote Dashboard
- Safari
- SDK
- Standard Schema
- TypeScript
- Vivaldi
- WeakMap
- WebRTC
- WebSocket
- Windsurf
- X
- xAI
- YouTube
- Zod
- zod

## Code, CLI, and configuration identifiers

- All `<code>` element contents (CLI commands, config keys, file paths, URLs).
- `active-tab`, `bridge`, `config`, `content-script`, `extension`, `package` (Doctor layers).
- `AES-GCM`
- `chrome.storage.local`
- `chrome://extensions`
- `API`
- `CVV`
- `GDPR`
- `HTTP`
- `HTTPS`
- `IP`
- `maskInputs`
- `PBKDF2`
- `URL`
- `URLs`
- `UUID`
- `UX`
- Action API names in `pages/about/about-page.component.html` Action Library
  (~50 identifiers including `navigate`, `click`, `type`, `cdpMouseClick`,
  `getDomTree`, `waitForElement`, etc.).
- File paths, absolute URLs, npm package names.

## Inline-wrapping convention

When any term above appears inside a translatable sentence in source HTML,
wrap it inline:

```html
<p i18n="@@home.intro.body">
  Use <span translate="no">FSB</span> with <span translate="no">Claude Code</span>
  to drive a real browser.
</p>
```

When a whole element is brand-only AND carries an `i18n` marker, use the binding
form so the i18n lint rule does not flag a missing `i18n-translate` companion:

```html
<span i18n="@@shell.brand.text" [attr.translate]="'no'">FSB</span>
```

When a whole element is brand-only with NO i18n marker (a plain wrapper), the
static form is preferred:

```html
<span translate="no">FSB</span>
```

When a `<code>` element wraps a CLI command, mark `translate="no"` directly on
the `<code>` element:

```html
<pre><code translate="no">npx -y fsb-mcp-server install --claude-code</code></pre>
```

## How this file is used

- Authors mark source HTML using these conventions so `ng extract-i18n` produces
  placeholders the translator cannot rewrite.
- Translators preserve these tokens while translating the surrounding prose.
- `npm run verify:translation-quality` confirms target placeholder markup is
  byte-equal and in the same order as the source. It also checks the literal text
  inside protected placeholders, rejects likely prose hidden inside a non-code
  `translate=no` wrapper, and checks invariant technical terms, target-only
  translator annotations, and balanced parentheses. Source-equal whole messages
  additionally require a source-hash-bound review in
  `same-source-allowlist.json`. A locale-standard punctuation variant that
  normalizes to the English source must be exceptional and is bound to both the
  exact source and target hashes.

Captured web-page DOM and arbitrary user-, extension-, or provider-supplied text
remain producer-owned and must not be rewritten. Localize only package-owned
viewer chrome and known runtime status values before presentation.

## Maintenance

- New product or competitor names: add alphabetically.
- New code identifiers: keep wrapped in `<code translate="no">` in source HTML;
  no need to enumerate individual identifiers in this file unless ambiguous.
- Review this file whenever a new protected term is introduced.
