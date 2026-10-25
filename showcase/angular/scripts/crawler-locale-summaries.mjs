const MARKETING_PAGES = [
  { id: 'home', route: '' },
  { id: 'about', route: '/about' },
  { id: 'agents', route: '/agents' },
  { id: 'support', route: '/support' },
];

function decodeXml(value) {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) return String.fromCodePoint(parseInt(normalized.slice(2), 16));
    if (normalized.startsWith('#')) return String.fromCodePoint(parseInt(normalized.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[normalized];
  });
}

function messages(catalog) {
  const result = new Map();
  for (const match of catalog.matchAll(/<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g)) {
    const id = match[1].match(/\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    if (result.has(id)) throw new Error(`Duplicate crawler message: ${id}`);
    const source = match[2].match(/<source>([\s\S]*?)<\/source>/)?.[1];
    const target = match[2].match(/<target\b([^>]*)>([\s\S]*?)<\/target>/);
    result.set(id, { source, target: target?.[2], state: target?.[1].match(/\bstate="([^"]+)"/)?.[1] });
  }
  return result;
}

function plainText(value, locale, id) {
  if (value === undefined || /<[^>]*>/.test(value)) {
    throw new Error(`Missing plain-text crawler copy: ${locale}/${id}`);
  }
  const decoded = decodeXml(value).replace(/\s+/g, ' ').trim();
  if (!decoded) throw new Error(`Empty crawler copy: ${locale}/${id}`);
  return decoded;
}

function escapeMarkdown(value) {
  return value.replace(/([\\`*_[\]<>])/g, '\\$1');
}

/** Build discovery summaries from the same catalogs as the localized page heads. */
export function buildLocalizedMarketingIndex({ locales, subpaths, sourceLocale, host, catalogForLocale }) {
  const sourceMessages = messages(catalogForLocale(sourceLocale));
  const lines = ['## Localized marketing pages', ''];
  for (const locale of locales) {
    if (subpaths[locale] === undefined) throw new Error(`Missing crawler locale subpath: ${locale}`);
    const localeMessages = locale === sourceLocale ? sourceMessages : messages(catalogForLocale(locale));
    lines.push(`### ${locale}`, '');
    for (const page of MARKETING_PAGES) {
      const copy = ['title', 'description'].map(field => {
        const id = `${page.id}.meta.${field}`;
        const source = plainText(sourceMessages.get(id)?.source, sourceLocale, id);
        const message = localeMessages.get(id);
        if (locale === sourceLocale) return source;
        if (plainText(message?.source, locale, id) !== source) {
          throw new Error(`Stale crawler translation source: ${locale}/${id}`);
        }
        if (message?.state !== 'translated') throw new Error(`Unreviewed crawler translation: ${locale}/${id}`);
        return plainText(message.target, locale, id);
      });
      const prefix = subpaths[locale] ? `/${subpaths[locale]}` : '';
      const url = `${host}${prefix}${page.route}`;
      lines.push(`- [${escapeMarkdown(copy[0])}](${url}): ${escapeMarkdown(copy[1])}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
