import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, Scroll } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { APP_VERSION } from '../../core/seo/version';
import { ThemeService } from '../../core/theme.service';
import { LanguagePickerComponent } from '../language-picker/language-picker.component';

const ROUTE_SCROLL_RESET_DELAYS_MS = [0, 50, 150, 350, 700];
const PERSISTENT_ROUTE_SCROLL_RESET_DELAYS_MS = [0, 50, 150, 350, 700, 1500, 3000];
const ROUTE_SCROLL_RESET_STORAGE_KEY = 'fsb-route-scroll-top';

@Component({
  selector: 'app-showcase-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LanguagePickerComponent],
  templateUrl: './showcase-shell.component.html',
  styleUrl: './showcase-shell.component.scss',
})
export class ShowcaseShellComponent implements OnInit, OnDestroy {
  // Unused directly, but injecting it here -- the one layout component that
  // wraps every route -- is what makes Angular construct this app-wide
  // singleton at all, which is what actually applies the system theme.
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private routeSub?: Subscription;
  private scrollResetTimers: number[] = [];

  readonly appVersion = APP_VERSION;
  mobileMenuOpen = false;
  navScrolled = false;
  shellless = false;

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  prepareRouteTopNavigation(): void {
    this.markRouteTopNavigation();
    this.scrollToRouteTop(true);
  }

  ngOnInit(): void {
    this.updateShellMode();
    this.useManualBrowserScrollRestoration();
    this.routeSub = new Subscription();
    this.routeSub.add(this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updateShellMode();
        this.scrollToRouteTopWhenNoFragment();
      }));
    this.routeSub.add(this.router.events
      .pipe(filter((event): event is Scroll => event instanceof Scroll))
      .subscribe((event) => {
        if (!event.anchor) {
          this.scrollToRouteTopWhenNoFragment();
        }
      }));
    this.scrollToRouteTopWhenNoFragment();
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.clearScrollResetTimers();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.navScrolled = window.scrollY > 10;
  }

  private updateShellMode(): void {
    let activeRoute = this.route;
    while (activeRoute.firstChild) {
      activeRoute = activeRoute.firstChild;
    }
    this.shellless = activeRoute.snapshot.data['shellless'] === true;
    if (this.shellless) {
      this.closeMobileMenu();
    }
  }

  private scrollToRouteTop(persistent = false): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    this.clearScrollResetTimers();
    this.resetWindowScroll();

    const delays = persistent ? PERSISTENT_ROUTE_SCROLL_RESET_DELAYS_MS : ROUTE_SCROLL_RESET_DELAYS_MS;
    for (const delayMs of delays) {
      const timer = window.setTimeout(() => {
        this.scrollResetTimers = this.scrollResetTimers.filter((id) => id !== timer);
        window.requestAnimationFrame(() => this.resetWindowScroll());
      }, delayMs);
      this.scrollResetTimers.push(timer);
    }
  }

  private scrollToRouteTopWhenNoFragment(): void {
    const pendingRouteTopNavigation = this.consumeRouteTopNavigation();
    if (typeof window !== 'undefined' && window.location.hash && !pendingRouteTopNavigation) return;
    this.scrollToRouteTop(pendingRouteTopNavigation);
  }

  private resetWindowScroll(): void {
    window.scrollTo(0, 0);
    const scrollers = [
      document.scrollingElement,
      document.documentElement,
      document.body,
    ].filter((scroller): scroller is Element => !!scroller);

    for (const scroller of scrollers) {
      if (scroller instanceof HTMLElement) {
        scroller.scrollTop = 0;
        scroller.scrollLeft = 0;
      }
    }
  }

  private clearScrollResetTimers(): void {
    if (typeof window === 'undefined') return;
    for (const timer of this.scrollResetTimers) {
      window.clearTimeout(timer);
    }
    this.scrollResetTimers = [];
  }

  private useManualBrowserScrollRestoration(): void {
    if (
      typeof window === 'undefined' ||
      !window.history ||
      !('scrollRestoration' in window.history)
    ) {
      return;
    }

    window.history.scrollRestoration = 'manual';
  }

  private markRouteTopNavigation(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      window.sessionStorage.setItem(ROUTE_SCROLL_RESET_STORAGE_KEY, '1');
    } catch {
      // Ignore private-mode storage failures; the immediate scroll reset still runs.
    }
  }

  private consumeRouteTopNavigation(): boolean {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    try {
      const pending = window.sessionStorage.getItem(ROUTE_SCROLL_RESET_STORAGE_KEY) === '1';
      if (pending) {
        window.sessionStorage.removeItem(ROUTE_SCROLL_RESET_STORAGE_KEY);
      }
      return pending;
    } catch {
      return false;
    }
  }
}
