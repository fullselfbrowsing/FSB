import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home-page.component').then(m => m.HomePageComponent) },
  { path: 'about', loadComponent: () => import('./pages/about/about-page.component').then(m => m.AboutPageComponent) },
  { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard-page.component').then(m => m.DashboardPageComponent) },
  { path: 'agents', loadComponent: () => import('./pages/agents/agents-page.component').then(m => m.AgentsPageComponent) },
  { path: 'privacy', loadComponent: () => import('./pages/privacy/privacy-page.component').then(m => m.PrivacyPageComponent) },
  { path: 'support', loadComponent: () => import('./pages/support/support-page.component').then(m => m.SupportPageComponent) },
  { path: 'stats', loadComponent: () => import('./pages/stats/stats-page.component').then(m => m.StatsPageComponent), data: { shellless: true } },
  { path: 'lattice', loadComponent: () => import('./pages/lattice/lattice-page.component').then(m => m.LatticePageComponent), data: { shellless: true } },
  { path: 'phantom-stream', loadComponent: () => import('./pages/phantom-stream/phantom-stream-page.component').then(m => m.PhantomStreamPageComponent), data: { shellless: true } },
  { path: 'prometheus', loadComponent: () => import('./pages/prometheus/prometheus-page.component').then(m => m.PrometheusPageComponent), data: { shellless: true } },
  { path: 'sitemaps', loadComponent: () => import('./pages/sitemaps/sitemaps-page.component').then(m => m.SiteMapsPageComponent) },
  { path: '**', redirectTo: '' },
];
