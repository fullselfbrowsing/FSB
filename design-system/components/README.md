# Components

This folder holds the design tool's prototyping kit: 17 React components in five groups. Each component has three files:

- `Name.jsx`, the prototype;
- `Name.d.ts`, its props and variants;
- `Name.prompt.md`, usage rules and an example.

Each group also has a `group.card.html` specimen. The kit exists so design canvases can be built from FSB's real look.

**Never import these files into shipped code.** FSB ships no React. The extension is plain HTML, CSS and JS, and the showcase is Angular. The table below maps each prototype to the shipped implementation it stands for. When the two differ, the shipped code is what users see. The difference is either fixed in the code, with a decision record if a rule changes, or listed here.

The `.card.html` files load a `_ds_bundle.js` that only the design tool builds, plus React and Babel from a CDN. They render inside the design tool, not from disk. The foundation specimens in [../guidelines/](../guidelines/type-scale.card.html) render anywhere; see [../index.html](../index.html).

## Inventory

| Component | Variants in the kit | Shipped as | Differences |
|---|---|---|---|
| [FsbMark](brand/FsbMark.prompt.md) | size, version, color | Showcase `.fsb-row`, `.fsb-f`, `.fsb-s`, `.fsb-b`, defined once in `fsb-wordmark.css`, inside an `.fsb-mark` wrapper in the shell, the closing plane, home, agents and the research pages, and inside inline-styled spans in release notes; onboarding's own copy in onboarding.css | No shared component: eight showcase templates repeat the markup, and `fsb-wordmark-parity.test.js` holds every copy to the sheet. Showcase F and S are `::before` content in the inline `'FSB Wordmark'` faces; the kit and onboarding print real F and S. The B is 0.74em everywhere. The home and agents highlight copies track at 0, the kit at `-0.02em`. See [../foundations/brand.md](../foundations/brand.md) |
| [VersionTag](brand/VersionTag.prompt.md) | text, size | `.version-tag` in the showcase shell, options.css and onboarding.css; `.footer-version` in the side panel | The showcase tag uses a platform stack that starts at SF Mono, but not the [0012](../decisions/0012-platform-mono-for-technical-text.md) stack; onboarding and the control panel still set it in Space Mono |
| [Button](core/Button.prompt.md) | primary, outline, github; md, sm | Showcase `.btn` with `.btn-primary`, `.btn-outline`, `.btn-github`, `.btn-sm` (styles.scss); onboarding `.ob-btn-primary`, `.ob-btn-ghost`; control panel `.save-btn` (flat orange, no gradient) | The showcase outline button keeps 12px 28px padding inside its 2px border (the kit compensates to 10px 26px). There is no shipped disabled style. Onboarding styles a ghost variant (`.ob-btn-ghost`) that no markup uses |
| [Badge](core/Badge.prompt.md) | eyebrow, fsb, competitor, recommended, nav, selector, tool | Page-local classes on home, about and agents; product `.dash-badge` and `.feature-badge` (fsb-ui-core.css) | Sizes and tracking vary page by page. The shipped "recommended" flag, `.eng-rec` on home, is a 0.6rem mono pill that is uppercase only through its parent `.eng-kind`; the kit's is 0.7rem at weight 700 |
| [Card](core/Card.prompt.md) | feature, provider, competitor, highlight | Page-local cards on home and agents; product `.form-card`, `.api-status-card` (fsb-ui-core.css) | Agents cards use 26px padding, a 42px icon tile at 12% wash and a 3px lift. The kit uses 28×26px padding, 34px at 10% and a 4px lift |
| [SectionHeader](core/SectionHeader.prompt.md) | num, eyebrow, align | `.section-header` (styles.scss), centred only | No left-aligned variant ships. The numbered form exists only inline in release notes |
| [StatBlock](core/StatBlock.prompt.md) | value, label | `.fsb-stats`, `.fsb-stat`, `.fsb-stat-value`, `.fsb-stat-label` on home and about | The shipped value is 1.5rem and the label 0.8rem; the kit uses 1.4rem and 0.78rem |
| [Field](forms/Field.prompt.md) | label, hint | `.form-group label` (options.css); onboarding labels | No shipped hint style |
| [Input](forms/Input.prompt.md) | text | `.form-input` (options.css, focus ring from fsb-ui-core.css); onboarding key input; showcase dashboard input | Onboarding and the dashboard inputs use a mono font |
| [Textarea](forms/Textarea.prompt.md) | rows | The side panel's `.input-wrapper` with a contenteditable `.chat-input` | The shipped input grows with content, has resize off and a 20px-radius wrapper |
| [Select](forms/Select.prompt.md) | options | `.form-select` and the custom `.fsb-select` listbox (options.css); the showcase language picker | The kit is a native select with a Font Awesome chevron |
| [Toggle](forms/Toggle.prompt.md) | checked, label | `.toggle-switch`, `.toggle-track`, `.toggle-thumb` (options.css) | Shipped track 44×24 with an 18px knob, flat orange. The kit uses 46×26, a gradient track and a 20px knob |
| [Checkbox](forms/Checkbox.prompt.md) | checked, label | Native checkboxes; the side panel sets `accent-color: #f97316` | No custom checkbox ships, and `#f97316` is not the brand orange |
| [SearchField](forms/SearchField.prompt.md) | value, placeholder | About's `.kg-search` (pill); a 12px-radius search in options.css | The agents page has no search box, though the kit's agents screen does |
| [NavBar](navigation/NavBar.prompt.md) | links, active | The showcase shell nav: `.nav-inner`, `.nav-brand`, `.nav-links`, `.nav-actions`, `.nav-toggle`, `.nav-mobile`; the depth-page variant `.nav--depth` with the bottom cue `.fsb-navcue` | The shell adds a scrolled state, a hamburger menu and the depth cue. There is no top-left logo on depth pages at 768px and below |
| [Footer](navigation/Footer.prompt.md) | columns, version, bottom links | Shell footer: `.footer-inner`, `.footer-brand`, `.footer-column`, `.footer-links`, `.footer-bottom`; `.author-footer` in fsb-ui-core.css | Four columns and no byline. The bottom row holds the version tag and the language picker. Depth pages replace the footer with a closing site-index plane |
| [Toast](feedback/Toast.prompt.md) | open, code | Onboarding `.ob-toast`; the control panel's `.status-toast` (top-right, with error variants); the showcase has none (copy buttons show an inline `.copied` state) | The kit says a toast never carries an error; `.status-toast` does |

Paths: [styles.scss](../../showcase/angular/src/styles.scss), [fsb-wordmark.css](../../showcase/angular/src/styles/fsb-wordmark.css), [showcase-shell.component.scss](../../showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.scss), [fsb-ui-core.css](../../extension/shared/fsb-ui-core.css), [options.css](../../extension/ui/options.css), [sidepanel.css](../../extension/ui/sidepanel.css), [onboarding.css](../../extension/ui/onboarding.css).

## Kept out on purpose

The product has no Avatar, Tabs, Dialog, Tooltip or Accordion component, so the kit has none. The Support FAQ is page-specific; see [../surfaces/showcase.md](../surfaces/showcase.md).
