import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AboutPageComponent } from '../../pages/about/about-page.component';
import { AgentsPageComponent } from '../../pages/agents/agents-page.component';
import { HomePageComponent } from '../../pages/home/home-page.component';
import { PrivacyPageComponent } from '../../pages/privacy/privacy-page.component';
import { SupportPageComponent } from '../../pages/support/support-page.component';

/* Before the engine starts (prerendered HTML, slow connection), depth.scss hides every
   plane but the first with `visibility: hidden` on the plane. A descendant that sets
   `visibility: visible` itself is not hidden by that and paints over the first plane.
   Rules inside a plane must use `inherit` to show something. */
describe('depth pages before the engine starts', () => {
  const pages: [string, Type<unknown>][] = [
    ['home', HomePageComponent],
    ['about', AboutPageComponent],
    ['agents', AgentsPageComponent],
    ['privacy', PrivacyPageComponent],
    ['support', SupportPageComponent],
  ];

  for (const [name, component] of pages) {
    it(`shows nothing from a later plane on ${name}`, async () => {
      await TestBed.configureTestingModule({
        imports: [component],
        providers: [provideRouter([])],
      }).compileComponents();
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();

      const host: HTMLElement = fixture.nativeElement;
      const stage = host.querySelector<HTMLElement>('.fsb-depth')!;
      stage.removeAttribute('data-depth-live');
      const laterPlanes = Array.from(host.querySelectorAll<HTMLElement>('.fsb-depth-layer')).slice(1);
      expect(laterPlanes.length).toBeGreaterThan(0);

      const showing = laterPlanes.flatMap(plane =>
        Array.from(plane.querySelectorAll<HTMLElement>('*'))
          .filter(element => getComputedStyle(element).visibility === 'visible')
          .map(element => `${element.tagName.toLowerCase()}.${element.className}`),
      );
      expect(showing).toEqual([]);

      fixture.destroy();
    });
  }
});
