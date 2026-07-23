// Phase 261 / ROUTE-02 -- Single source of truth for the six showcase locales.
// MIRRORED at showcase/server/src/utils/locale-constants.js (CJS for Express).
// CI invariant: showcase/angular/scripts/verify-locale-sync.mjs asserts the two
// files declare identical LOCALES lists. Any divergence fails CI.

export const SOURCE_LOCALE = 'en' as const;

export const LOCALES = ['en', 'es', 'de', 'ja', 'zh-CN', 'zh-TW'] as const;

export type LocaleCode = typeof LOCALES[number];

export const LOCALE_NATIVE_LABELS: Record<LocaleCode, string> = {
  'en':    'English',
  'es':    'Español',
  'de':    'Deutsch',
  'ja':    '\u65e5\u672c\u8a9e',
  'zh-CN': '\u7b80\u4f53\u4e2d\u6587',
  'zh-TW': '\u7e41\u9ad4\u4e2d\u6587'
};

export const LOCALE_SUBPATHS: Record<LocaleCode, string> = {
  'en':    '',
  'es':    'es',
  'de':    'de',
  'ja':    'ja',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW'
};

export function isValidLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
