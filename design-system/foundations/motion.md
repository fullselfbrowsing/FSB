# Motion

Quick, eased and quiet. One long loop, the hero glow, and nothing that bounces.

## Rules

- **MUST** use the three durations, all eased: 150ms for colour and border, 250ms for transform, shadow and most state changes, 400ms for slow reveals (`--transition-fast`, `--transition-base`, `--transition-slow`).
- **Hover:** cards lift 4px and buttons 2px, with a border-colour step. Dimmed elements rise in opacity on hover. Press has no separate style.
- **MUST NOT** use bounce, spring or scale-in. The only decorative loop on the site is the hero glow, a soft orange radial that breathes on a 12–14s cycle.
- **MUST** honour `prefers-reduced-motion`. With it on, transitions and loops stop or drop to a single resting frame; shapes and colours may still change.
- **MUST** plan motion toward the end state. When someone describes a motion by naming its parts ("everything zooms out and then readjusts"), every part they name is unwanted. Remove them rather than smoothing the jank between them.
- **MUST NOT** shrink or zoom a section to make room for content that opens inside it. Keep its size and scroll inside it. See [0007](../decisions/0007-depth-pages-on-phones.md).
- **Angular showcase:**
  - **MUST** give keyframe names a per-page prefix (`psPktFly`, `dashWakePulse`, `capMarq`).
  - **MUST NOT** put an `animation` in an inline `style` attribute. Angular renames component keyframes but cannot rewrite inline styles, so the animation silently does nothing. Put the animation on a class in the component stylesheet.
- **Overlays** keep their own timings (glow laps, text pacing, the done hold, the silence timers). They are listed in [../surfaces/overlays.md](../surfaces/overlays.md).

## Tokens

| Name | Value | Where it ships |
|---|---|---|
| `--transition-fast` | 150ms ease | styles.scss, onboarding.css |
| `--transition-base` | 250ms ease | styles.scss, onboarding.css |
| `--transition-slow` | 400ms ease | styles.scss, onboarding.css |
| `--lift-card` / `--lift-button` (proposed) | -4px / -2px | literals |

## Specimens

[Transitions](../guidelines/motion-transitions.card.html), [signature patterns](../guidelines/motion-signature.card.html).

## Known gaps

- **Control panel timing differs.** options.css uses 150/200/300ms ease-in-out under the same token names.
- **Literal durations dominate.** The showcase has about 318 literal durations against 82 token uses.
- **No global reduced-motion guard on the site.** styles.scss gates only `scroll-behavior`; each page handles reduced motion itself, and the popup does not handle it at all.
- The design-system specimen pages do have a global guard in [../tokens/reset.css](../tokens/reset.css).

## Evidence

- [styles.scss](../../showcase/angular/src/styles.scss) `--transition-*`, the `prefers-reduced-motion` block
- [release-notes-page.component.scss](../../showcase/angular/src/app/pages/release-notes/release-notes-page.component.scss) the `rn-*` animation classes and reduced-motion block
- [options.css](../../extension/ui/options.css) `--transition-*`
