#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const HOST = 'https://full-selfbrowsing.com';
export const PAGES = { home: '', about: 'about', agents: 'agents', support: 'support' };

export function decode(value) {
  return value.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (_, entity) => {
    if (entity.toLowerCase().startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[entity.toLowerCase()];
  });
}

export function visibleText(value) {
  return decode(value.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)]
    .map(([, key, , value]) => [key.toLowerCase(), decode(value)]));
}

export function readCatalog(xml, locale) {
  const catalog = new Map();
  for (const match of xml.matchAll(/<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g)) {
    const id = attributes(match[1]).id;
    const field = locale === 'en' ? 'source' : 'target';
    const value = match[2].match(new RegExp(`<${field}\\b[^>]*>([\\s\\S]*?)</${field}>`))?.[1];
    assert.ok(value !== undefined, `${locale}: missing ${field} for ${id}`);
    assert.ok(!catalog.has(id), `${locale}: duplicate translation ID ${id}`);
    catalog.set(id, visibleText(value));
  }
  return catalog;
}

function one(values, label) {
  assert.equal(values.length, 1, `${label}: expected exactly one, got ${values.length}`);
  return values[0];
}

export function jsonLdNodes(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => attributes(match[1]).type === 'application/ld+json')
    .flatMap(match => {
      const node = JSON.parse(match[2]);
      return Array.isArray(node) ? node : node['@graph'] || [node];
    });
}

function localeUrl(locale, route, subpaths) {
  const prefix = subpaths[locale] ? `/${subpaths[locale]}` : '';
  return `${HOST}${prefix}${route ? `/${route}` : ''}`;
}

export function verifyPage({ html, locale, page, catalog, reviewedCopy, locales, subpaths }) {
  const label = `${locale}/${page}`;
  const expected = id => {
    assert.ok(catalog.has(id), `${label}: missing expected catalog message ${id}`);
    return catalog.get(id);
  };
  const url = localeUrl(locale, PAGES[page], subpaths);
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
  const meta = key => one(metas.filter(tag => tag.name === key || tag.property === key), `${label}: ${key}`).content;
  const title = expected(`${page}.meta.title`);
  const description = expected(`${page}.meta.description`);
  assert.equal(visibleText(one([...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)], `${label}: title`)[1]), title, `${label}: localized title`);
  for (const key of ['og:title', 'twitter:title']) assert.equal(meta(key), title, `${label}: ${key}`);
  for (const key of ['description', 'og:description', 'twitter:description']) assert.equal(meta(key), description, `${label}: ${key}`);
  for (const key of ['og:image:alt', 'twitter:image:alt']) assert.equal(meta(key), expected(`${page}.og.imageAlt`), `${label}: ${key}`);
  assert.equal(meta('og:site_name'), expected('site.name'), `${label}: site name`);
  assert.equal(meta('og:url'), url, `${label}: localized Open Graph URL`);
  assert.equal(one(links.filter(tag => tag.rel === 'canonical'), `${label}: canonical`).href, url, `${label}: canonical URL`);
  assert.equal(attributes(html.match(/<html\b[^>]*>/i)?.[0] || '').lang, locale, `${label}: document language`);
  const alternates = links.filter(tag => tag.rel === 'alternate' && tag.hreflang);
  assert.equal(alternates.length, locales.length + 1, `${label}: alternate count`);
  for (const targetLocale of [...locales, 'x-default']) {
    const alternate = one(alternates.filter(tag => tag.hreflang === targetLocale), `${label}: hreflang ${targetLocale}`);
    assert.equal(alternate.href, localeUrl(targetLocale === 'x-default' ? 'en' : targetLocale, PAGES[page], subpaths), `${label}: hreflang ${targetLocale} URL`);
  }

  const graph = jsonLdNodes(html);
  const type = page === 'about' ? 'AboutPage' : page === 'support' ? 'FAQPage' : 'WebPage';
  const context = one(graph.filter(node => node['@type'] === type), `${label}: ${type}`);
  assert.equal(context.url, url, `${label}: page schema URL`);
  assert.equal(context['@id'], `${url}#${page === 'support' ? 'faq' : 'webpage'}`, `${label}: page schema identity`);
  assert.equal(context.inLanguage, locale, `${label}: page schema language`);
  assert.equal(context.name, title, `${label}: page schema title`);
  assert.equal(context.description, description, `${label}: page schema description`);
  const org = one(graph.filter(node => node['@type'] === 'Organization'), `${label}: Organization`);
  assert.equal(org['@id'], `${HOST}/#org`, `${label}: stable organization identity`);
  assert.equal(org.name, 'FSB', `${label}: literal FSB organization brand`);
  assert.ok(org.alternateName.includes('Full Self-Browsing') && org.alternateName.includes('Full Self Browsing'), `${label}: full brand aliases`);

  const definitions = new Set(graph.filter(node => node['@id']).map(node => node['@id']));
  function verifyReferences(value) {
    if (!value || typeof value !== 'object') return;
    if (value['@id'] === `${HOST}/#site`) assert.ok(definitions.has(value['@id']), `${label}: undefined WebSite reference`);
    if (Object.keys(value).length === 1 && value['@id']?.startsWith(`${url}#`)) {
      assert.ok(definitions.has(value['@id']), `${label}: undefined localized schema reference ${value['@id']}`);
    }
    Object.values(value).forEach(verifyReferences);
  }
  graph.forEach(verifyReferences);

  for (const node of graph.filter(node => ['SoftwareApplication', 'VideoObject'].includes(node['@type']))) {
    assert.equal(node.inLanguage, undefined, `${label}: shared software/media must not claim localized audio or software`);
  }
  if (page === 'home') {
    const heading = one([...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)], `${label}: brand heading`);
    assert.equal(visibleText(heading[2]), 'Full Self-Browsing', `${label}: literal Home brand heading`);
    const headingContent = heading[2].replace(/<!--[\s\S]*?-->/g, '').trim();
    const protectedHeading = attributes(heading[1]).translate === 'no'
      || /^<span\b[^>]*\btranslate=["']no["'][^>]*>[\s\S]*<\/span>$/.test(headingContent);
    assert.ok(protectedHeading, `${label}: protected Home brand heading`);
    const highlighted = [...heading[2].matchAll(/<span\b([^>]*)>([^<>]*)<\/span>/gi)]
      .filter(match => (attributes(match[1]).class || '').split(/\s+/).includes('highlight'));
    assert.equal(visibleText(one(highlighted, `${label}: highlighted Self`)[2]), 'Self', `${label}: highlighted Self brand segment`);
    const tagline = one([...html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)]
      .filter(match => (attributes(match[1]).class || '').split(/\s+/).includes('hero-subtitle')), `${label}: tagline`);
    const fixture = reviewedCopy['home.hero.subtitle'];
    const approvedTagline = locale === 'en' ? fixture.source : fixture.targets[locale];
    assert.ok(approvedTagline, `${label}: reviewed tagline fixture missing`);
    assert.equal(expected('home.hero.subtitle'), approvedTagline, `${label}: catalog tagline matches reviewed copy`);
    assert.equal(visibleText(tagline[2]), approvedTagline, `${label}: visible approved tagline`);
    const software = one(graph.filter(node => node['@type'] === 'SoftwareApplication'), `${label}: software`);
    assert.equal(software['@id'], `${HOST}/#software`, `${label}: stable software identity`);
    assert.equal(software.url, HOST, `${label}: shared software URL`);
    assert.equal(software.name, 'FSB', `${label}: literal software brand`);
    assert.equal(software.description, expected('home.schema.description'), `${label}: software description`);
    const dataset = one(graph.filter(node => node['@type'] === 'Dataset'), `${label}: benchmark dataset`);
    assert.equal(dataset['@id'], `${HOST}/#online-mind2web`, `${label}: stable benchmark identity`);
    assert.equal(dataset.name, expected('home.schema.benchmark.name'), `${label}: benchmark name`);
    assert.equal(dataset.description, expected('home.schema.benchmark.description'), `${label}: benchmark description`);
    assert.equal(dataset.about?.['@id'], software['@id'], `${label}: benchmark is about the software`);
    assert.equal(software.subjectOf?.['@id'], dataset['@id'], `${label}: software links its benchmark`);
  } else if (page === 'agents') {
    const software = one(graph.filter(node => node['@type'] === 'SoftwareApplication'), `${label}: skill`);
    assert.equal(software['@id'], `${HOST}/agents#fsb-skill`, `${label}: stable skill identity`);
    assert.equal(software.url, `${HOST}/agents`, `${label}: shared skill URL`);
    assert.equal(software.name, expected('agents.schema.software.name'), `${label}: skill name`);
    assert.equal(software.description, expected('agents.schema.software.description'), `${label}: skill description`);
    const howTo = one(graph.filter(node => node['@type'] === 'HowTo'), `${label}: HowTo`);
    assert.equal(howTo['@id'], `${url}#install-howto`, `${label}: localized HowTo identity`);
    assert.equal(howTo.url, `${url}#install-howto`, `${label}: localized HowTo URL`);
    assert.equal(howTo.inLanguage, locale, `${label}: HowTo language`);
    assert.equal(howTo.name, expected('agents.schema.howTo.name'), `${label}: HowTo title`);
    assert.equal(howTo.description, expected('agents.schema.howTo.description'), `${label}: HowTo description`);
    for (const [index, step] of ['extension', 'server', 'doctor'].entries()) {
      assert.equal(howTo.step[index].name, expected(`agents.schema.howTo.${step}.name`), `${label}: ${step} step name`);
      assert.equal(howTo.step[index].text, expected(`agents.schema.howTo.${step}.text`), `${label}: ${step} step text`);
    }
  } else if (page === 'about') {
    const video = one(graph.filter(node => node['@type'] === 'VideoObject'), `${label}: video`);
    assert.ok(video['@id'].startsWith(`${HOST}/about#demo-`), `${label}: stable video identity`);
    assert.equal(video.name, expected('about.schema.trailer.name'), `${label}: localized video name`);
    assert.equal(video.description, expected('about.schema.trailer.description'), `${label}: localized video description`);
  } else {
    const questions = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
      .filter(match => (attributes(match[1]).class || '').split(/\s+/).includes('faq-question')).map(match => visibleText(match[2]));
    const answers = [...html.matchAll(/class="faq-answer-inner"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map(match => visibleText(match[1]));
    assert.deepEqual(questions, context.mainEntity.map(question => question.name), `${label}: visible FAQ question parity`);
    assert.deepEqual(answers, context.mainEntity.map(question => visibleText(question.acceptedAnswer.text)), `${label}: visible FAQ answer parity`);
    const faqIds = [...catalog.keys()].filter(id => /^support\.schema\.faq\..+\.q$/.test(id));
    assert.equal(context.mainEntity.length, faqIds.length, `${label}: all catalog FAQs rendered`);
    for (const id of faqIds) {
      const question = one(context.mainEntity.filter(question => question.name === expected(id)), `${label}: catalog FAQ ${id}`);
      assert.equal(visibleText(question.acceptedAnswer.text), expected(id.replace(/\.q$/, '.a')), `${label}: catalog FAQ answer ${id}`);
    }
  }
}

export function main() {
  const registry = readFileSync(join(ROOT, 'src/app/core/i18n/locale-constants.ts'), 'utf8');
  const locales = registry.match(/LOCALES\s*=\s*\[([^\]]+)\]/)[1].split(',').map(value => value.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const block = registry.match(/LOCALE_SUBPATHS[^{]*\{([\s\S]*?)\}/)[1];
  const subpaths = Object.fromEntries([...block.matchAll(/['"]([\w-]+)['"]\s*:\s*['"]([^'"]*)['"]/g)].map(match => [match[1], match[2]]));
  const reviewedCopy = JSON.parse(readFileSync(join(ROOT, 'scripts/fixtures/marketing-copy.json'), 'utf8'));
  const dist = process.env.DIST_ROOT || join(ROOT, '..', 'dist', 'showcase-angular', 'browser');
  for (const locale of locales) {
    const filename = locale === 'en' ? 'messages.xlf' : `messages.${locale}.xlf`;
    const catalog = readCatalog(readFileSync(join(ROOT, 'src/locale', filename), 'utf8'), locale);
    for (const page of Object.keys(PAGES)) {
      const html = readFileSync(join(dist, subpaths[locale], PAGES[page], 'index.html'), 'utf8');
      verifyPage({ html, locale, page, catalog, reviewedCopy, locales, subpaths });
    }
  }
  console.log(`Localized marketing copy, branding, SEO and schema checks passed for ${Object.keys(PAGES).length * locales.length} prerendered pages.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
