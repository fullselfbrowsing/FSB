# 0016. Indigo folds into the brand orange; light blue into info

- Status: Accepted
- Date: 2026-11-25

## Context and problem statement

Indigo `#6366f1`, with dark-mode shades `#818cf8` and `#a5b4fc`, marked AI and research features: the recon button, research pagination, the AI memory badge and the recon AI note. Light blue `#60a5fa` marked payment prompts and dark-mode links. [DESIGN.md](../../DESIGN.md) asks for one accent. The owner compared the options on 2026-11-25.

## Considered options

1. Fold both: indigo becomes the brand orange, and light blue becomes `--fsb-info`.
2. Keep indigo as an AI accent, renamed to its role, and fold light blue.
3. Keep both.

## Decision outcome

Chosen option 1, by the owner.

## Consequences

- **Indigo becomes orange.** Solid indigo reads `--fsb-primary`. Indigo washes move to the brand-orange steps of [0018](0018-brand-orange-transparencies-four-steps.md), and white text on the orange reads `--fsb-on-primary`.
- **Light blue becomes info.** `#60a5fa` reads `--fsb-info`, which is `#4dd0e1` in dark mode under [0015](0015-status-colours-soften-in-dark-mode.md). Its washes keep their alpha.
- **Removed tokens:** `--fsb-indigo-500` and `--fsb-blue-400`.
- **Contrast drops.** On light pages, the recon button and the AI memory badge now show orange text on an orange wash: 2.47:1, where indigo gave 3.89:1. This is the same pattern as the transcribing mic. The brand orange is 2.84:1 even on white, so it cannot carry small text on light surfaces. A darker text orange is an open decision; see [DESIGN.md](../../DESIGN.md), Known Gaps.
- **Not covered, candidates for a later pass:**
  - the payment prompt's own blue ramp (`#1d4ed8`, `#2563eb`, `#3b82f6` and their washes);
  - the AI mode badge (`#3b82f6`);
  - markdown's light-mode links (`#1a73e8`);
  - the Visa label;
  - the payment-confirm violet (`#7c5cff`).

## Evidence

- [extension/ui/sidepanel.css](../../extension/ui/sidepanel.css) `.recon-btn`, `.message.payment-prompt`, `.history-cost`
- [extension/ui/options.css](../../extension/ui/options.css) `.research-pagination`, `.memory-badge.ai-enhanced`, `.recon-ai-note`
- [extension/ui/markdown.css](../../extension/ui/markdown.css) `[data-theme="dark"] .md-rendered a`
