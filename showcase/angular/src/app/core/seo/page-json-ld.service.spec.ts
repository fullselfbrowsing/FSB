import { DOCUMENT, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageJsonLdService } from './page-json-ld.service';

describe('PageJsonLdService', () => {
  let doc: Document;

  function service(platform = 'browser'): PageJsonLdService {
    doc = document.implementation.createHTMLDocument();
    TestBed.configureTestingModule({ providers: [
      { provide: DOCUMENT, useValue: doc },
      { provide: PLATFORM_ID, useValue: platform },
    ] });
    return TestBed.inject(PageJsonLdService);
  }

  it('upserts metadata and escapes script delimiters without changing parsed text', () => {
    const metadata = service();
    metadata.set('video', { name: 'old' });
    const name = '</script><script>alert(1)</script>';
    metadata.set('video', { name });
    const scripts = doc.head.querySelectorAll('script[data-ld="video"]');
    expect(scripts.length).toBe(1);
    expect(scripts[0].textContent).not.toContain('<');
    expect(JSON.parse(scripts[0].textContent || '{}').name).toBe(name);
  });

  it('removes departed-page metadata while preserving the shared Organization', () => {
    const metadata = service();
    const organization = doc.createElement('script');
    organization.type = 'application/ld+json';
    organization.textContent = '{"@type":"Organization"}';
    doc.head.appendChild(organization);
    metadata.set('video', { '@type': 'VideoObject' });
    metadata.remove('video');
    expect(doc.head.querySelector('script[data-ld="video"]')).toBeNull();
    expect(doc.head.contains(organization)).toBeTrue();
    metadata.remove('video');
  });

  it('retains structured data during server teardown for prerender serialization', () => {
    const metadata = service('server');
    metadata.set('video', { '@type': 'VideoObject' });
    metadata.remove('video');
    expect(doc.head.querySelector('script[data-ld="video"]')).not.toBeNull();
  });
});
