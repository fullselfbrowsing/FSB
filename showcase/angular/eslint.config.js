// Phase 261 / CI-03 -- ESLint v9 flat config for the showcase Angular project.
// Two rule blocks: TypeScript and HTML templates. The template/i18n rule is
// scoped to **/*.html only; meaningless on TS files and would produce noise.
// Defaults for checkId / checkText / checkAttributes are already true per the
// rule docs; explicit declaration documents the CI-03 locked decision in-source.
// Source: github.com/angular-eslint/angular-eslint blob CONFIGURING_FLAT_CONFIG.md
// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {},
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {
      // Phase 262 (CI-03 promoted) -- enforce marked strings + custom @@id markers
      // + attribute coverage, with a documented exemption list for machine tokens
      // and routing attributes that are never user-visible.
      '@angular-eslint/template/i18n': ['error', {
        checkId: true,
        checkText: true,
        checkAttributes: true,
        ignoreAttributes: [
          // Machine tokens -- never visible to end users
          'rel', 'href', 'src', 'srcset', 'loading', 'decoding', 'referrerpolicy',
          'allow', 'allowfullscreen', 'sandbox',
          // SVG geometry / class hooks
          'd', 'stroke-linejoin', 'stroke-linecap', 'fill', 'viewBox',
          // Data attributes (test ids, internal hooks)
          'data-testid', 'data-tab', 'data-type', 'data-ld',
          // Routing (Angular router takes literal strings, not translations)
          'routerLink', 'routerLinkActive',
          // ARIA structural attributes (not user-facing text)
          // aria-live / aria-busy are politeness/busy tokens (e.g. "polite"), not copy
          'aria-controls', 'aria-expanded', 'aria-hidden', 'aria-live', 'aria-busy',
          // Image / element MIME-style flags
          'type', 'role'
        ]
      }]
    }
  }
);
