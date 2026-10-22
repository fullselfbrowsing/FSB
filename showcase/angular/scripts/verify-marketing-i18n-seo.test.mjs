import assert from 'node:assert/strict';
import test from 'node:test';
import { HOST, readCatalog, verifyPage, visibleText } from './verify-marketing-i18n-seo.mjs';

const locales = ['en', 'es'];
const subpaths = { en: '', es: 'es' };
const approved = 'AI-powered browser automation through natural language and connected AI agents. Built for the future of autonomous browsing.';
const translated = 'Automatización del navegador con IA mediante lenguaje natural y agentes de IA conectados. Diseñado para el futuro de la navegación autónoma.';
const reviewedCopy = { 'home.hero.subtitle': { source: approved, targets: { es: translated } } };

function escape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function fixture(page = 'home') {
  const url = `${HOST}/es${page === 'home' ? '' : `/${page}`}`;
  const catalog = new Map([
    [`${page}.meta.title`, `FSB — ${page} en español`],
    [`${page}.meta.description`, `Información de ${page} y automatización con FSB.`],
    [`${page}.og.imageAlt`, 'Logotipo de FSB Full Self-Browsing'],
    ['site.name', 'FSB - Full Self-Browsing'],
    ['home.hero.subtitle', translated],
    ['home.schema.description', 'Automatización local del navegador con FSB.'],
    ['home.schema.benchmark.name', 'FSB en Online-Mind2Web: los 10 mejores agentes por tasa de éxito promedio'],
    ['home.schema.benchmark.description', 'Tasas de éxito promedio en Online-Mind2Web, con FSB incluido. FSB: resultado revisado por IA (277/300), 92,3 %.'],
    ['support.schema.faq.install.q', '¿Cómo instalo FSB?'],
    ['support.schema.faq.install.a', 'Instala FSB desde Chrome Web Store.'],
  ]);
  const context = {
    '@type': page === 'support' ? 'FAQPage' : 'WebPage',
    '@id': `${url}#${page === 'support' ? 'faq' : 'webpage'}`,
    url, inLanguage: 'es', name: catalog.get(`${page}.meta.title`), description: catalog.get(`${page}.meta.description`),
  };
  const graph = [
    { '@type': 'Organization', '@id': `${HOST}/#org`, name: 'FSB', alternateName: ['Full Self-Browsing', 'Full Self Browsing'] },
    context,
  ];
  let body;
  if (page === 'home') {
    graph.push(
      { '@type': 'SoftwareApplication', '@id': `${HOST}/#software`, url: HOST, name: 'FSB', description: catalog.get('home.schema.description'), subjectOf: { '@id': `${HOST}/#online-mind2web` } },
      { '@type': 'Dataset', '@id': `${HOST}/#online-mind2web`, name: catalog.get('home.schema.benchmark.name'), description: catalog.get('home.schema.benchmark.description'), about: { '@id': `${HOST}/#software` } },
    );
    body = `<h1 translate="no">Full <span class="highlight">Self</span>-Browsing</h1><p class="hero-subtitle">${translated}</p>`;
  } else {
    context.mainEntity = [{ '@type': 'Question', name: catalog.get('support.schema.faq.install.q'), acceptedAnswer: { '@type': 'Answer', text: catalog.get('support.schema.faq.install.a') } }];
    body = '<h3><button class="faq-question"><span>¿Cómo instalo FSB?</span><i aria-hidden="true"></i></button></h3><div class="faq-answer-inner"><p>Instala FSB desde Chrome Web Store.</p></div>';
  }
  function render() {
    const meta = (key, value) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escape(value)}">`;
    const title = catalog.get(`${page}.meta.title`);
    const description = catalog.get(`${page}.meta.description`);
    const metadata = [meta('description', description), ...['og:title', 'twitter:title'].map(key => meta(key, title)),
      ...['og:description', 'twitter:description'].map(key => meta(key, description)),
      ...['og:image:alt', 'twitter:image:alt'].map(key => meta(key, catalog.get(`${page}.og.imageAlt`))),
      meta('og:site_name', catalog.get('site.name')), meta('og:url', url)].join('');
    const alternates = [...locales, 'x-default'].map(locale => {
      const prefix = locale === 'es' ? '/es' : '';
      return `<link rel="alternate" hreflang="${locale}" href="${HOST}${prefix}${page === 'home' ? '' : `/${page}`}">`;
    }).join('');
    return `<html lang="es"><head><title>${escape(title)}</title>${metadata}<link rel="canonical" href="${url}">${alternates}<script type="application/ld+json">${JSON.stringify({ '@graph': graph })}</script></head><body>${body}</body></html>`;
  }
  return { options: { locale: 'es', page, catalog, reviewedCopy, locales, subpaths }, graph, context, render };
}

function verify(value, transform = html => html) {
  verifyPage({ ...value.options, html: transform(value.render()) });
}

test('catalog reader decodes XML and inline placeholders without changing visible copy', () => {
  const xml = '<trans-unit datatype="html" id="brand"><source>FSB &amp; Full Self-Browsing</source><target state="translated">FSB &amp; <x id="START_TAG_SPAN"/>Full Self-Browsing<x id="CLOSE_TAG_SPAN"/></target></trans-unit>';
  assert.equal(readCatalog(xml, 'es').get('brand'), 'FSB & Full Self-Browsing');
  assert.equal(visibleText('Full <!--binding--> <span>Self</span>-Browsing'), 'Full Self-Browsing');
});

test('accepts localized metadata, protected heading and reviewed tagline in prerendered HTML', () => {
  verify(fixture());
  verify(fixture(), html => html.replace('<h1 translate="no">Full <span class="highlight">Self</span>-Browsing</h1>', '<h1><span translate="no">Full <span class="highlight">Self</span>-Browsing</span></h1>'));
});

test('rejects untranslated metadata and duplicate tags left from a previous route', () => {
  assert.throws(() => verify(fixture(), html => html.replace('content="FSB — home en español"', 'content="English title"')), /og:title/);
  assert.throws(() => verify(fixture(), html => html.replace('</head>', '<meta name="description" content="Previous route"></head>')), /description: expected exactly one/);
});

test('rejects catalog-valid but outdated reviewed tagline translations', () => {
  const value = fixture();
  value.options.catalog.set('home.hero.subtitle', 'Dile qué hacer y míralo navegar por ti.');
  assert.throws(() => verify(value), /catalog tagline matches reviewed copy/);
});

test('rejects changed or unprotected brand headings and missing Self highlighting', () => {
  assert.throws(() => verify(fixture(), html => html.replace('Full <span class="highlight">Self</span>-Browsing', 'Navegación autónoma')), /literal Home brand heading/);
  assert.throws(() => verify(fixture(), html => html.replace('translate="no"', 'translate="yes"')), /protected Home brand heading/);
  assert.throws(() => verify(fixture(), html => html.replace('class="highlight"', 'class="plain"')), /highlighted Self/);
});

test('rejects source-locale page contexts and undefined local references', () => {
  const value = fixture();
  value.context.inLanguage = 'en';
  assert.throws(() => verify(value), /page schema language/);
  value.context.inLanguage = 'es';
  value.context.mainEntity = { '@id': `${HOST}/es#undefined` };
  assert.throws(() => verify(value), /undefined localized schema reference/);
});

test('rejects localized shared-software IDs and media-language claims', () => {
  const value = fixture();
  const software = value.graph.find(node => node['@type'] === 'SoftwareApplication');
  software['@id'] = `${HOST}/es#software`;
  assert.throws(() => verify(value), /stable software identity/);
  software['@id'] = `${HOST}/#software`;
  software.inLanguage = 'es';
  assert.throws(() => verify(value), /must not claim localized audio or software/);
});

test('validates both FAQ question and answer parity against visible text and catalog', () => {
  verify(fixture('support'));
  assert.throws(() => verify(fixture('support'), html => html.replace('<span>¿Cómo instalo FSB?</span>', '<span>Pregunta diferente</span>')), /visible FAQ question parity/);
  assert.throws(() => verify(fixture('support'), html => html.replace('<p>Instala FSB desde Chrome Web Store.</p>', '<p>Respuesta diferente</p>')), /visible FAQ answer parity/);
  const value = fixture('support');
  value.options.catalog.set('support.schema.faq.install.a', 'Texto actualizado que aún no se muestra.');
  assert.throws(() => verify(value), /catalog FAQ answer/);
});

test('rejects a home benchmark dataset that drifts from the catalog or loses its software link', () => {
  const drifted = fixture();
  drifted.graph.find(node => node['@type'] === 'Dataset').description = 'FSB: 99%.';
  assert.throws(() => verify(drifted), /benchmark description/);
  const orphaned = fixture();
  delete orphaned.graph.find(node => node['@type'] === 'SoftwareApplication').subjectOf;
  assert.throws(() => verify(orphaned), /software links its benchmark/);
  const missing = fixture();
  missing.graph.splice(missing.graph.findIndex(node => node['@type'] === 'Dataset'), 1);
  assert.throws(() => verify(missing), /benchmark dataset: expected exactly one/);
});
