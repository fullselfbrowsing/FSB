import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideClientHydration, withI18nSupport, withNoHttpTransferCache } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    // Reuse the prerendered DOM instead of emptying <app-root> and drawing the page
    // again when the scripts arrive. withI18nSupport is what lets components with
    // translated blocks take part; without it nearly every page here is skipped.
    // The app makes no HttpClient calls on the server, so there is nothing to transfer.
    provideClientHydration(withI18nSupport(), withNoHttpTransferCache()),
  ],
};
