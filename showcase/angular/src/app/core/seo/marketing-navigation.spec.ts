import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AboutPageComponent } from '../../pages/about/about-page.component';
import { AgentsPageComponent } from '../../pages/agents/agents-page.component';
import { HomePageComponent } from '../../pages/home/home-page.component';
import { SupportPageComponent } from '../../pages/support/support-page.component';
import { LOCALES, LOCALE_SUBPATHS } from '../i18n/locale-constants';
import { HOST } from './locale-seo';
import ONLINE_MIND2WEB from './online-mind2web.json';
import TRAILER_VIDEO from './trailer-video.json';

describe('marketing route metadata', () => {
  for (const locale of LOCALES) {
  it(`replaces localized schemas across Home → About → Agents → Support → About (${locale})`, async () => {
    // The graph loads external scripts and is unrelated to route metadata.
    spyOn(AboutPageComponent.prototype, 'ngAfterViewInit').and.stub();
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: locale }, provideRouter([
      { path: '', component: HomePageComponent },
      { path: 'about', component: AboutPageComponent },
      { path: 'agents', component: AgentsPageComponent },
      { path: 'support', component: SupportPageComponent },
    ])] });
    const organization = document.createElement('script');
    organization.type = 'application/ld+json';
    organization.textContent = JSON.stringify({
      '@type': 'Organization', '@id': `${HOST}/#org`, name: 'FSB',
      alternateName: ['Full Self-Browsing', 'Full Self Browsing'],
    });
    document.head.appendChild(organization);
    const harness = await RouterTestingHarness.create();
    try {
      for (const [path, key] of [
        ['/', 'software-application'], ['/about', 'about-trailer-video'],
        ['/agents', 'agents-page'], ['/support', 'support-faq'],
        ['/about', 'about-trailer-video'],
      ]) {
        await harness.navigateByUrl(path);
        const schemas = document.head.querySelectorAll('script[data-ld]');
        expect(schemas.length).withContext(path).toBe(1);
        expect(schemas[0].getAttribute('data-ld')).withContext(path).toBe(key);
        expect(document.head.contains(organization)).toBeTrue();
        expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
        expect(document.head.querySelectorAll('link[hreflang]').length).toBe(LOCALES.length + 1);
        const route = path === '/' ? '' : path;
        const prefix = LOCALE_SUBPATHS[locale];
        const url = `${HOST}${prefix ? `/${prefix}` : ''}${route}`;
        expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(url);
        expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(url);
        expect(document.head.querySelector(`link[hreflang="${locale}"]`)?.getAttribute('href')).toBe(url);
        expect(document.head.querySelector('link[hreflang="x-default"]')?.getAttribute('href')).toBe(`${HOST}${route}`);

        const schema = JSON.parse(schemas[0].textContent || '{}');
        const nodes = schema['@graph'] || [schema];
        const pageType = path === '/about' ? 'AboutPage' : path === '/support' ? 'FAQPage' : 'WebPage';
        const page = nodes.find((node: { '@type': string }) => node['@type'] === pageType);
        expect(page.url).toBe(url);
        expect(page['@id']).toBe(`${url}${path === '/support' ? '#faq' : '#webpage'}`);
        expect(page.inLanguage).toBe(locale);
        expect(page.name).toBe(document.title);
        expect(page.description).toBe(document.head.querySelector('meta[name="description"]')?.getAttribute('content'));
        const nodeIds = new Set<string>(nodes.map((node: { '@id': string }) => node['@id']));
        nodeIds.add(`${HOST}/#org`);
        expectResolvedReferences(schema, nodeIds);

        const software = nodes.find((node: { '@type': string }) => node['@type'] === 'SoftwareApplication');
        if (software) {
          expect(software.inLanguage).toBeUndefined();
          expect(software['@id']).toBe(path === '/' ? `${HOST}/#software` : `${HOST}/agents#fsb-skill`);
          expect(software.url).toBe(path === '/' ? HOST : `${HOST}/agents`);
          expect(page.mainEntity['@id']).toBe(software['@id']);
        }
        const datasets = nodes.filter((node: { '@type': string }) => node['@type'] === 'Dataset');
        expect(datasets.length).toBe(path === '/' ? 1 : 0);
        if (path === '/') {
          expect(datasets[0]['@id']).toBe(`${HOST}/#online-mind2web`);
          expect(datasets[0].about['@id']).toBe(software['@id']);
          expect(software.subjectOf['@id']).toBe(datasets[0]['@id']);
          expect(datasets[0].isBasedOn).toBe(ONLINE_MIND2WEB.leaderboardUrl);
          expect(datasets[0].description).toContain(`${ONLINE_MIND2WEB.fsb.passed}/${ONLINE_MIND2WEB.fsb.total}`);
        }
        if (path === '/agents') {
          const howTo = nodes.find((node: { '@type': string }) => node['@type'] === 'HowTo');
          expect(howTo['@id']).toBe(`${url}#install-howto`);
          expect(howTo.url).toBe(howTo['@id']);
          expect(howTo.inLanguage).toBe(locale);
          expect(howTo.isPartOf['@id']).toBe(page['@id']);
          expect(howTo.about['@id']).toBe(software['@id']);
          expect(page.hasPart['@id']).toBe(howTo['@id']);
        }
        const videos = nodes.filter((node: { '@type': string }) => node['@type'] === 'VideoObject');
        expect(videos.length).toBe(path === '/about' ? 1 : 0);
        if (path === '/about') {
          expect(videos[0]['@id']).toBe(`${HOST}/about#demo-${TRAILER_VIDEO.id}`);
          expect(videos[0].url).toBe(TRAILER_VIDEO.watchUrl);
          expect(videos[0].inLanguage).toBeUndefined();
          expect(videos[0].isPartOf['@id']).toBe(page['@id']);
          expect(page.video['@id']).toBe(videos[0]['@id']);
        }
        if (path === '/support') {
          const answers = Array.from(harness.routeNativeElement!.querySelectorAll('.faq-answer-inner > p'));
          expect(answers.map(answer => answer.textContent!.trim()))
            .toEqual(schema.mainEntity.map((question: { acceptedAnswer: { text: string } }) => question.acceptedAnswer.text));
          const questions = harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.faq-question');
          expect(Array.from(questions, question => question.textContent!.trim()))
            .toEqual(schema.mainEntity.map((question: { name: string }) => question.name));
          questions[0].click();
          questions[1].click();
          harness.fixture.detectChanges();
          expect(questions[0].getAttribute('aria-expanded')).toBe('true');
          expect(questions[1].getAttribute('aria-expanded')).toBe('true');
        }
      }
    } finally {
      harness.fixture.destroy();
      organization.remove();
    }
  });
  }
});

function expectResolvedReferences(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach(item => expectResolvedReferences(item, ids));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === '@id') expect(typeof item === 'string' && ids.has(item)).withContext(`Unresolved schema reference ${item}`).toBeTrue();
      else expectResolvedReferences(item, ids);
    }
  }
}
