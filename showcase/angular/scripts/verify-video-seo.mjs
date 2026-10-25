#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateVideoSitemap } from './validate-video-sitemap.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = process.env.DIST_ROOT || join(root, '..', 'dist', 'showcase-angular', 'browser');
const trailer = JSON.parse(readFileSync(join(root, 'src/app/core/seo/trailer-video.json'), 'utf8'));
const registry = readFileSync(join(root, 'src/app/core/i18n/locale-constants.ts'), 'utf8');
const locales = registry.match(/LOCALES\s*=\s*\[([^\]]+)\]/)[1]
  .split(',').map(value => value.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
assert.equal(validateVideoSitemap(sitemap), locales.length, 'All localized video entries must pass Google\'s XSD');
const sitemapEntries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => match[1]);

function decode(value) {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity];
  });
}

function text(value) {
  return decode(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function nodes(html) {
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap(match => { const node = JSON.parse(match[1]); return node['@graph'] || [node]; });
}

function xmlField(xml, field) {
  const value = xml.match(new RegExp(`<${field}>([\\s\\S]*?)</${field}>`))?.[1];
  assert.ok(value, `Missing sitemap field ${field}`);
  return decode(value);
}

assert.equal((sitemap.match(/<video:video>/g) || []).length, locales.length);
for (const locale of locales) {
  const prefix = locale === 'en' ? '' : locale;
  const aboutUrl = `https://full-selfbrowsing.com/${prefix ? `${prefix}/` : ''}about`;
  const html = readFileSync(join(dist, prefix, 'about', 'index.html'), 'utf8');
  const graph = nodes(html);
  const videos = graph.filter(node => node['@type'] === 'VideoObject');
  assert.equal(videos.length, 1, `${locale}: exactly one VideoObject`);
  const video = videos[0];
  assert.equal(video['@id'], `https://full-selfbrowsing.com/about#demo-${trailer.id}`, `${locale}: stable original-video identity`);
  assert.equal(video.inLanguage, undefined, `${locale}: localized metadata must not claim translated video audio`);
  for (const key of ['embedUrl', 'thumbnailUrl', 'uploadDate', 'duration']) {
    assert.equal(video[key], trailer[key], `${locale}: ${key}`);
  }
  assert.equal(video.alternateName, trailer.originalTitle);
  const page = graph.find(node => node['@type'] === 'AboutPage');
  assert.equal(page.url, aboutUrl);
  assert.equal(page.inLanguage, locale);
  assert.equal(page.video['@id'], video['@id']);
  assert.equal(video.isPartOf['@id'], page['@id']);
  const iframe = html.match(/<iframe\b[^>]*>/)?.[0] || '';
  assert.ok(iframe.includes(`src="${video.embedUrl}"`), `${locale}: player present in initial HTML`);
  assert.ok(iframe.includes('loading="eager"'), `${locale}: no interaction required to load player`);
  assert.equal(text(html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)[1]), video.name);
  const copy = html.match(/class="video-demo-copy"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.equal(text(copy.match(/<p[^>]*>([\s\S]*?)<\/p>/)[1]), video.description);
  assert.ok(copy.includes(trailer.watchUrl), `${locale}: YouTube link`);
  const entry = sitemapEntries.find(entry => xmlField(entry, 'loc') === aboutUrl);
  assert.ok(entry, `${locale}: video sitemap entry`);
  for (const [field, expected] of Object.entries({
    'video:title': video.name, 'video:description': video.description,
    'video:player_loc': video.embedUrl, 'video:thumbnail_loc': video.thumbnailUrl,
    'video:publication_date': video.uploadDate, 'video:duration': String(trailer.durationSeconds),
  })) assert.equal(xmlField(entry, field), expected, `${locale}: ${field}`);

  const support = readFileSync(join(dist, prefix, 'support', 'index.html'), 'utf8');
  const faq = nodes(support).find(node => node['@type'] === 'FAQPage');
  assert.equal(faq.url, aboutUrl.replace(/about$/, 'support'));
  assert.equal(faq.inLanguage, locale);
  const questions = [...support.matchAll(/<button\b[^>]*class="faq-question"[^>]*>([\s\S]*?)<\/button>/g)]
    .map(match => text(match[1]));
  assert.deepEqual(questions, faq.mainEntity.map(question => text(question.name)), `${locale}: visible FAQ question/schema parity`);
  const answers = [...support.matchAll(/class="faq-answer-inner"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map(match => text(match[1]));
  assert.deepEqual(answers, faq.mainEntity.map(question => text(question.acceptedAnswer.text)), `${locale}: visible FAQ/schema parity`);
  assert.equal(answers.length, 15);
  for (const route of ['', 'agents', 'support']) {
    const other = readFileSync(join(dist, prefix, route, 'index.html'), 'utf8');
    assert.equal(nodes(other).filter(node => node['@type'] === 'VideoObject').length, 0);
  }
}
console.log(`Video XSD validation, metadata, initial HTML, localized video sitemaps, and FAQ parity passed for ${locales.length} locales.`);
