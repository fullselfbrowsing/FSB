import assert from 'node:assert/strict';
import test from 'node:test';
import { validateVideoSitemap } from './validate-video-sitemap.mjs';

const thumbnail = '<video:thumbnail_loc>https://example.com/thumb.jpg</video:thumbnail_loc>';
const title = '<video:title>FSB &amp; Full Self-Browsing</video:title>';
const description = '<video:description>AI browser automation.</video:description>';
const player = '<video:player_loc>https://example.com/player</video:player_loc>';
const duration = '<video:duration>33</video:duration>';
const date = '<video:publication_date>2026-09-06T18:41:54-07:00</video:publication_date>';
const valid = [thumbnail, title, description, player, duration, date];

function sitemap(fields = valid) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
      <url><loc>https://example.com/about</loc>
        <xhtml:link rel="alternate" hreflang="en" href="https://example.com/about"/>
        <video:video>${fields.join('')}</video:video>
      </url>
    </urlset>`;
}

test('validates the corrected order and inherited namespaces offline', () => {
  assert.equal(validateVideoSitemap(sitemap()), 1);
  assert.equal(validateVideoSitemap(sitemap().replaceAll('video:', 'media:').replace('xmlns:video=', 'xmlns:media=')), 1);
  assert.equal(validateVideoSitemap(sitemap().replace(date, '<video:publication_date>2026-09-06</video:publication_date>')), 1);
});

test('validates every video, including a later invalid localized entry', () => {
  const good = sitemap().match(/<url>[\s\S]*?<\/url>/)[0];
  const seven = sitemap().replace(good, good.repeat(7));
  assert.equal(validateVideoSitemap(seven), 7);
  const bad = good.replace(duration + date, date + duration);
  assert.throws(() => validateVideoSitemap(seven.replace('</urlset>', bad + '</urlset>')), /XSD validation failed/);
});

test('rejects title before thumbnail, including the original combined regression', () => {
  assert.throws(() => validateVideoSitemap(sitemap([title, description, thumbnail, player, duration, date])), /XSD validation failed/);
  assert.throws(() => validateVideoSitemap(sitemap([title, description, thumbnail, player, date, duration])), /XSD validation failed/);
});

test('rejects publication date before duration even with a valid thumbnail order', () => {
  assert.throws(() => validateVideoSitemap(sitemap([thumbnail, title, description, player, date, duration])), /XSD validation failed/);
});

test('rejects missing required fields', () => {
  for (const required of [thumbnail, title, description]) {
    assert.throws(() => validateVideoSitemap(sitemap(valid.filter(field => field !== required))), /XSD validation failed/);
  }
});

test('rejects duplicate required and optional fields', () => {
  assert.throws(() => validateVideoSitemap(sitemap([thumbnail, title, title, description, player, duration, date])), /XSD validation failed/);
  assert.throws(() => validateVideoSitemap(sitemap([thumbnail, title, description, player, duration, duration, date])), /XSD validation failed/);
});

test('rejects malformed XML, including outside the video entry', () => {
  assert.throws(() => validateVideoSitemap(sitemap().replace('</url>', '</other>')), /Malformed sitemap XML/);
  assert.throws(() => validateVideoSitemap(sitemap().replace('FSB &amp;', 'FSB &')), /Malformed sitemap XML/);
});

test('rejects negative, excessive, and nonnumeric video durations', () => {
  for (const value of ['-1', '28801', 'thirty-three']) {
    assert.throws(() => validateVideoSitemap(sitemap().replace(duration, `<video:duration>${value}</video:duration>`)), /XSD validation failed/);
  }
});

test('rejects invalid publication dates', () => {
  for (const value of ['2026-13-99', 'yesterday']) {
    assert.throws(() => validateVideoSitemap(sitemap().replace(date, `<video:publication_date>${value}</video:publication_date>`)), /XSD validation failed/);
  }
});

test('fails rather than skipping validation when xmllint is unavailable', () => {
  assert.throws(() => validateVideoSitemap(sitemap(), { xmlLint: `missing-xmllint-fixture-${process.pid}` }), /requires xmllint.*libxml2-utils/);
});

test('rejects an empty video sitemap', () => {
  assert.throws(() => validateVideoSitemap(sitemap().replace(/<video:video>[\s\S]*?<\/video:video>/, '')), /at least one namespaced video entry/);
});
