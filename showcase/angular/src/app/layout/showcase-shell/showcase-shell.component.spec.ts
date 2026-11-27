import { Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AppComponent } from '../../app.component';
import { ThemeService } from '../../core/theme.service';
import { depthPageForPath, shelllessForPath } from './showcase-shell.component';
import { routes } from '../../app.routes';

@Component({
  standalone: true,
  template: '<p class="test-page">Page content</p>',
})
class TestPageComponent {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('Showcase shell footer readiness', () => {
  let fixture: ComponentFixture<AppComponent>;
  let router: Router;
  let lazyPage: ReturnType<typeof deferred<Type<unknown>>>;
  let lazyRequested: ReturnType<typeof deferred<void>>;

  beforeEach(async () => {
    lazyPage = deferred<Type<unknown>>();
    lazyRequested = deferred<void>();

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: ThemeService, useValue: {} },
        provideRouter([
          { path: '', pathMatch: 'full', component: TestPageComponent },
          {
            path: 'delayed',
            loadComponent: () => {
              lazyRequested.resolve();
              return lazyPage.promise;
            },
          },
          { path: 'redirect', redirectTo: 'delayed' },
          {
            path: 'parent',
            children: [
              { path: 'hidden', component: TestPageComponent, data: { shellless: true } },
            ],
          },
          { path: 'cancelled', component: TestPageComponent, canActivate: [() => false] },
          {
            path: 'failed',
            loadComponent: () => Promise.reject(new Error('Page failed to load')),
          },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
  });

  function renderShell(): void {
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  }

  function footer(): HTMLElement | null {
    return fixture.nativeElement.querySelector('footer.footer');
  }

  function page(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.test-page');
  }

  it('keeps the footer absent until the first lazy page has activated', async () => {
    renderShell();
    expect(footer()).toBeNull();

    const navigation = router.navigateByUrl('/delayed');
    await lazyRequested.promise;
    fixture.detectChanges();
    expect(page()).toBeNull();
    expect(footer()).toBeNull();

    lazyPage.resolve(TestPageComponent);
    await navigation;
    fixture.detectChanges();
    expect(page()).not.toBeNull();
    expect(footer()).not.toBeNull();
  });

  it('shows the footer on a short page after successful navigation', async () => {
    renderShell();
    await router.navigateByUrl('/');
    fixture.detectChanges();

    expect(page()).not.toBeNull();
    expect(footer()).not.toBeNull();
  });

  it('renders the footer when initial navigation already completed before shell creation', async () => {
    await router.navigateByUrl('/');
    renderShell();

    expect(page()).not.toBeNull();
    expect(footer()).not.toBeNull();
  });

  it('waits for the redirect destination to activate before showing the footer', async () => {
    renderShell();
    const navigation = router.navigateByUrl('/redirect');
    await lazyRequested.promise;
    fixture.detectChanges();
    expect(footer()).toBeNull();

    lazyPage.resolve(TestPageComponent);
    await navigation;
    fixture.detectChanges();
    expect(router.url).toBe('/delayed');
    expect(page()).not.toBeNull();
    expect(footer()).not.toBeNull();
  });

  it('keeps the footer absent on a nested shellless route and restores it on a normal route', async () => {
    renderShell();
    expect(footer()).toBeNull();

    await router.navigateByUrl('/parent/hidden');
    fixture.detectChanges();
    expect(page()).not.toBeNull();
    expect(footer()).toBeNull();

    await router.navigateByUrl('/');
    fixture.detectChanges();
    expect(footer()).not.toBeNull();
  });

  it('preserves the existing footer while a subsequent lazy navigation is pending', async () => {
    renderShell();
    await router.navigateByUrl('/');
    fixture.detectChanges();
    const existingFooter = footer();
    expect(existingFooter).not.toBeNull();

    const navigation = router.navigateByUrl('/delayed');
    await lazyRequested.promise;
    fixture.detectChanges();
    expect(footer()).toBe(existingFooter);

    lazyPage.resolve(TestPageComponent);
    await navigation;
    fixture.detectChanges();
    expect(footer()).toBe(existingFooter);
  });

  it('keeps the footer absent after cancelled initial navigation until a page activates', async () => {
    renderShell();
    expect(await router.navigateByUrl('/cancelled')).toBeFalse();
    fixture.detectChanges();
    expect(page()).toBeNull();
    expect(footer()).toBeNull();

    const navigation = router.navigateByUrl('/delayed');
    await lazyRequested.promise;
    lazyPage.resolve(TestPageComponent);
    await navigation;
    fixture.detectChanges();
    expect(footer()).not.toBeNull();
  });

  it('keeps the footer absent when the first lazy page fails to load', async () => {
    renderShell();
    await expectAsync(router.navigateByUrl('/failed')).toBeRejectedWithError('Page failed to load');
    fixture.detectChanges();
    expect(page()).toBeNull();
    expect(footer()).toBeNull();
  });
});

describe('Showcase shell on depth pages', () => {
  let fixture: ComponentFixture<AppComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: ThemeService, useValue: {} },
        provideRouter([
          { path: '', pathMatch: 'full', component: TestPageComponent, data: { depth: 'home' } },
          { path: 'agents', component: TestPageComponent, data: { depth: 'agents' } },
          { path: 'plain', component: TestPageComponent },
        ]),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
  });

  async function open(url: string): Promise<HTMLElement> {
    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('swaps the top links for the nav cue and leaves the footer to the page', async () => {
    const el = await open('/');
    expect(el.querySelector('.fsb-navcue')).not.toBeNull();
    expect(el.querySelector('.nav-links')).toBeNull();
    expect(el.querySelector('.nav-toggle')).toBeNull();
    expect(el.querySelector('.nav-mobile')).toBeNull();
    expect(el.querySelector('footer.footer')).toBeNull();
    expect(el.querySelector('nav.nav')?.classList).toContain('nav--depth');
  });

  it('labels the cue with the current page and hides that page from the list', async () => {
    const el = await open('/agents');
    expect(el.querySelector('.fsb-navcue-text')?.textContent?.trim()).toBe('Agents');
    const current = el.querySelector('.fsb-navcue-list li.is-current a');
    expect(current?.getAttribute('href')).toBe('/agents');
    expect(current?.getAttribute('aria-current')).toBe('page');
    expect(el.querySelectorAll('.fsb-navcue-list li').length).toBe(5);
  });

  it('opens on click and closes on Escape or a click elsewhere', async () => {
    const el = await open('/');
    const trigger = el.querySelector<HTMLButtonElement>('.fsb-navcue-trigger')!;
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    fixture.detectChanges();
    document.body.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves no tinted flash on a tapped control', async () => {
    // Chrome on Android paints a translucent blue box over anything tapped unless
    // the page says otherwise; the controls have their own pressed and focus states.
    const el = await open('/');
    const transparent = 'rgba(0, 0, 0, 0)';
    const tapped = [document.documentElement, el.querySelector('.fsb-navcue-trigger'), el.querySelector('.fsb-navcue-list a')];
    expect(tapped.every((node) => node instanceof Element)).toBeTrue();
    for (const node of tapped) {
      expect(getComputedStyle(node as Element).getPropertyValue('-webkit-tap-highlight-color')).toBe(transparent);
    }
  });

  it('opens on hover only where the pointer can hover', async () => {
    // A tap leaves :hover stuck on a touch screen, so every rule that opens the cue
    // on hover (here and in styles/depth.scss) must sit behind (hover: hover).
    await open('/');
    const opensOnHover = /\.fsb-navcue(\[[^\]]*\])*:hover/;
    const found: { selector: string; media: string | null }[] = [];
    const walk = (rules: CSSRuleList, media: string | null): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.conditionText);
        else if (rule instanceof CSSStyleRule) {
          for (const selector of rule.selectorText.split(',')) {
            if (opensOnHover.test(selector)) found.push({ selector: selector.trim(), media });
          }
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      walk(rules, null);
    }
    expect(found.length).toBeGreaterThanOrEqual(5);
    expect(found.filter((r) => r.media !== '(hover: hover)')).toEqual([]);
  });

  it('leaves the logo off a phone, where the cue already has Home', async () => {
    // The test window is wider than a phone, so the rule itself is looked for.
    const el = await open('/');
    expect(el.querySelector('.nav--depth .nav-brand')).not.toBeNull();
    const hidesBrand = /\.nav--depth(\[[^\]]*\])*\s+\.nav-brand(\[[^\]]*\])*$/;
    const media: (string | null)[] = [];
    const walk = (rules: CSSRuleList, within: string | null): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.conditionText);
        else if (rule instanceof CSSStyleRule && rule.style.display === 'none' && rule.selectorText.split(',').some((s) => hidesBrand.test(s.trim()))) {
          media.push(within);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules, null);
      } catch {
        // A sheet from another origin cannot be read.
      }
    }
    expect(media).toEqual(['(max-width: 768px)']);
  });

  it('brings back the classic nav and footer on a page without depth', async () => {
    const el = await open('/');
    await router.navigateByUrl('/plain');
    fixture.detectChanges();
    expect(el.querySelector('.fsb-navcue')).toBeNull();
    expect(el.querySelector('.nav-links')).not.toBeNull();
    expect(el.querySelector('footer.footer')).not.toBeNull();
  });
});

describe('depthPageForPath', () => {
  it('maps the five depth routes and ignores everything else', () => {
    expect(depthPageForPath('')).toBe('home');
    expect(depthPageForPath('/')).toBe('home');
    expect(depthPageForPath('/about')).toBe('about');
    expect(depthPageForPath('/privacy#telemetry-disclosure')).toBe('privacy');
    expect(depthPageForPath('/support?ref=x')).toBe('support');
    expect(depthPageForPath('/agents/')).toBe('agents');
    expect(depthPageForPath('/legal')).toBeNull();
    expect(depthPageForPath('/release-notes')).toBeNull();
  });
});

describe('shelllessForPath', () => {
  it('is true for every route that declares itself shellless, and for no other', () => {
    for (const route of routes) {
      if (!route.path || route.path === '**') continue;
      expect(shelllessForPath('/' + route.path))
        .withContext(route.path)
        .toBe(route.data?.['shellless'] === true);
    }
    expect(shelllessForPath('')).toBeFalse();
  });

  it('ignores slashes, the query and the fragment', () => {
    expect(shelllessForPath('/lattice/?from=home#verbs')).toBeTrue();
    expect(shelllessForPath('about?x=1')).toBeFalse();
  });
});
