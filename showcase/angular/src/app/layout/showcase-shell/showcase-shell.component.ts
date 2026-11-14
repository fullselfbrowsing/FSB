import { Component, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { APP_VERSION } from '../../core/seo/version';
import { ThemeService } from '../../core/theme.service';
import { LanguagePickerComponent } from '../language-picker/language-picker.component';

/* Pages drawn as planes along the z axis (layout/depth). Their routes carry
   `data: { depth: <key> }`; on them the shell swaps the top links for the nav cue
   at the bottom edge and leaves the footer to the page's closing plane. */
export type DepthPageKey = 'home' | 'about' | 'agents' | 'privacy' | 'support';

const DEPTH_PATHS: Readonly<Record<string, DepthPageKey>> = {
  '': 'home',
  about: 'about',
  agents: 'agents',
  privacy: 'privacy',
  support: 'support',
};

/* Nav cue entries, top to bottom. Its list opens upward from the bottom edge. */
const CUE_ORDER: readonly string[] = ['home', 'about', 'agents', 'dashboard', 'privacy', 'support'];

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
  private readonly location = inject(Location);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private routeSub?: Subscription;

  readonly appVersion = APP_VERSION;
  mobileMenuOpen = false;
  navScrolled = false;
  shellless = false;
  initialNavigationComplete = this.router.navigated;
  /* Read from the URL before the router has resolved anything, so the first
     paint already has the right nav instead of flipping once navigation ends. */
  depthPage: DepthPageKey | null = depthPageForPath(this.location.path());
  cueOpen = false;

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  toggleCue(): void {
    this.cueOpen = !this.cueOpen;
  }

  closeCue(): void {
    this.cueOpen = false;
  }

  /** Stagger slot of a nav cue entry: the current page is hidden, so the ones
      after it move up one. */
  cueSlot(key: string): number {
    const i = CUE_ORDER.indexOf(key);
    const current = this.depthPage ? CUE_ORDER.indexOf(this.depthPage) : -1;
    return current < 0 || i < current ? i : Math.max(0, i - 1);
  }

  ngOnInit(): void {
    this.updateShellMode();
    this.routeSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updateShellMode();
        this.initialNavigationComplete = true;
        this.cueOpen = false;
      });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.navScrolled = window.scrollY > 10;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeCue();
  }

  /* A tap outside the cue closes it (hover closes it with a mouse already). */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.cueOpen) return;
    const target = event.target as Element | null;
    if (target?.closest?.('.fsb-navcue') && this.host.nativeElement.contains(target)) return;
    this.cueOpen = false;
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
    if (this.router.navigated) {
      const depth = activeRoute.snapshot.data['depth'];
      this.depthPage = isDepthPageKey(depth) ? depth : null;
    }
    if (this.depthPage) this.closeMobileMenu();
  }
}

function isDepthPageKey(value: unknown): value is DepthPageKey {
  return typeof value === 'string' && Object.values(DEPTH_PATHS).includes(value as DepthPageKey);
}

/* Location.path() is relative to the locale's base href, so /es/about reads as
   /about here. Query strings and fragments are not part of the match. */
export function depthPageForPath(path: string): DepthPageKey | null {
  const clean = path.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  return DEPTH_PATHS[clean] ?? null;
}
