// Phase 261 / ROUTE-02 -- MIRROR of showcase/angular/src/app/core/i18n/locale-constants.ts
// CI invariant: showcase/angular/scripts/verify-locale-sync.mjs asserts the two
// files declare identical LOCALES lists. Any divergence fails CI.
'use strict';

const SOURCE_LOCALE = 'en';

const LOCALES = ['en', 'es', 'de', 'ja', 'ko', 'zh-CN', 'zh-TW'];

const LOCALE_NATIVE_LABELS = {
  'en':    'English',
  'es':    'Espanol',
  'de':    'Deutsch',
  'ja':    '\u65e5\u672c\u8a9e',
  'ko':    '\ud55c\uad6d\uc5b4',
  'zh-CN': '\u7b80\u4f53\u4e2d\u6587',
  'zh-TW': '\u7e41\u9ad4\u4e2d\u6587'
};

const LOCALE_SUBPATHS = {
  'en':    '',
  'es':    'es',
  'de':    'de',
  'ja':    'ja',
  'ko':    'ko',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW'
};

function isValidLocale(value) {
  return typeof value === 'string' && LOCALES.includes(value);
}

module.exports = {
  SOURCE_LOCALE,
  LOCALES,
  LOCALE_NATIVE_LABELS,
  LOCALE_SUBPATHS,
  isValidLocale
};
