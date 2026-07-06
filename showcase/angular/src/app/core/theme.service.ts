import { Injectable } from '@angular/core';

// Prerender-safe environment helpers: in the @angular/ssr Node prerender environment
// `window`/`document` may not exist, or may exist as stub objects whose methods are
// not functions. Guard every call with both `typeof` and a function check
// (PITFALLS.md P1, D-20).
function hasDocument(): boolean {
  return typeof document !== 'undefined' && !!document.documentElement;
}

function getSystemThemeMedia(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia('(prefers-color-scheme: dark)');
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private dark = true;

  constructor() {
    const media = getSystemThemeMedia();
    if (media) {
      this.applyDark(media.matches);
      media.addEventListener('change', (e) => this.applyDark(e.matches));
    }
  }

  isDark(): boolean {
    return this.dark;
  }

  private applyDark(isDark: boolean): void {
    this.dark = isDark;
    if (!hasDocument()) return;
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }
}
