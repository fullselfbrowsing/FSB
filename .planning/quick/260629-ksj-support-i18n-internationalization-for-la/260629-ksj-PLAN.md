---
quick_id: 260629-ksj
slug: support-i18n-internationalization-for-la
description: Support i18n internationalization for latest updated showcase content
status: complete
created: 2026-06-29
---

# Quick Task 260629-ksj: Support i18n internationalization for latest updated showcase content

## Goal

Make the newest Showcase content extractable and buildable across the configured Angular locales without changing page layout or copy.

## Tasks

1. Localize runtime and metadata strings introduced by the latest Agents, Support, and Stats updates.
   - Files: Agents, Support, and Stats page components/templates.
   - Verify: Angular i18n extraction succeeds and the new ids appear in `messages.xlf`.

2. Refresh locale catalogs.
   - Files: `messages.xlf` plus `messages.{es,de,ja,zh-CN,zh-TW}.xlf`.
   - Verify: each target catalog has a target for every source trans-unit.

3. Update translation-protection guidance.
   - Files: `DO-NOT-TRANSLATE.md`.
   - Verify: newest brand/technical tokens are present.

## Verification

- `npm --prefix showcase/angular run ng -- extract-i18n --output-path src/locale --out-file messages.xlf`
- `npm --prefix showcase/angular run lint:i18n`
- `npm --prefix showcase/angular run build`
