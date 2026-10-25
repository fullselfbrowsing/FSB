import { Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AppComponent } from '../../app.component';
import { ThemeService } from '../../core/theme.service';

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
