import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { APP_VERSION } from '../../core/seo/version';
import { ThemeService } from '../../core/theme.service';
import { LanguagePickerComponent } from '../language-picker/language-picker.component';

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

  ngOnInit(): void {
    this.updateShellMode();
    this.routeSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.updateShellMode());
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
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
}
