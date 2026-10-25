import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, Injectable, PLATFORM_ID, RendererFactory2, inject } from '@angular/core';

/** Manages route metadata while leaving the shared Organization script intact. */
@Injectable({ providedIn: 'root' })
export class PageJsonLdService {
  private readonly doc = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly renderer = inject(RendererFactory2).createRenderer(null, null);

  set(key: string, payload: unknown): void {
    let script = this.doc.head.querySelector(`script[data-ld="${key}"]`);
    if (!script) {
      script = this.renderer.createElement('script') as HTMLScriptElement;
      this.renderer.setAttribute(script, 'type', 'application/ld+json');
      this.renderer.setAttribute(script, 'data-ld', key);
      this.renderer.appendChild(this.doc.head, script);
    }
    this.renderer.setProperty(script, 'textContent', JSON.stringify(payload).replace(/</g, '\\u003c'));
  }

  remove(key: string): void {
    // Server teardown must retain metadata for the serialized prerendered page.
    if (!isPlatformBrowser(this.platformId)) return;
    const script = this.doc.head.querySelector(`script[data-ld="${key}"]`);
    if (script) this.renderer.removeChild(this.doc.head, script);
  }
}
