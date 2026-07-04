// /stats Easter-egg page (quick task 260514-1nv).
//
// SSR contract:
//   * ngOnInit runs on server AND client; it ONLY sets <title> and the
//     robots noindex meta tag -- no DOM probing, no fetches, no Chart.js.
//   * afterNextRender(...) only runs in the browser (Angular contract). All
//     Chart.js access + GitHubStatsService.start() lives there, so the SSR
//     bundle never imports chart.js.
//   * The component participates in routing via lazy loadComponent from
//     app.routes.ts and is pinned to RenderMode.Client in app.routes.server.ts
//     -- so it is never prerendered into static HTML under any locale subpath.
//   * Crawler invariant: no entry in sitemap.xml / llms.txt / llms-full.txt /
//     prerender-routes.txt / hreflang verifier ROUTE_PATHS / locale-seo. The
//     <meta name="robots" content="noindex, nofollow"> tag is belt-and-
//     suspenders for the rare case a crawler stumbles in via the footer link.

import {
  AfterViewInit,
  Component,
  ElementRef,
  LOCALE_ID,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  afterNextRender,
  inject,
} from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { APP_VERSION } from '../../core/seo/version';
import { GitHubStatsService } from '../../core/stats/github-stats.service';
import {
  CommitEvent,
  DatasetState,
  IssueEvent,
  StarEvent,
  StatsViewId,
  WeeklyDelta,
} from '../../core/stats/github-stats.types';
import { FSBTelemetryService } from '../../core/stats/fsb-telemetry.service';
import {
  DatasetState as FSBDatasetState,
  FSBTelemetryHeadline,
  FSBTelemetrySeries,
} from '../../core/stats/fsb-telemetry.types';
import { regionCentroid } from '../../core/stats/region-geo';
import { GlobeVisualizationService } from '../../core/globe/globe-visualization.service';
import { GlobeRegion } from '../../core/globe/globe-visualization.types';

// Phase 274 / STATS-01 -- FSB view ids shown on this page. Local union
// widening so we do NOT have to touch github-stats.types.ts (which describes
// the GitHub dataset shape, a different concern). The view selector + chart
// switch operate on AnyViewId, while existing GitHub helpers continue to
// take StatsViewId.
export type FSBViewId = 'fsb-active-now' | 'fsb-tokens' | 'fsb-popular-mcp';
export type AnyViewId = StatsViewId | FSBViewId;

interface ViewOption {
  id: AnyViewId;
  label: string;
}

interface TabMetric {
  label: string;
  value: string;
}

// Redesigned fan-picker tab item -- `dy` is a vertical arc offset (px) so the
// non-active tabs read as a fanned-out arc rather than a flat list.
interface FanItem {
  id: AnyViewId;
  label: string;
  dy: number;
}

@Component({
  selector: 'app-stats-page',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink],
  templateUrl: './stats-page.component.html',
  styleUrl: './stats-page.component.scss',
})
export class StatsPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly statsService = inject(GitHubStatsService);
  // Phase 274 / STATS-03 -- FSB telemetry stream alongside GitHub stats.
  private readonly fsbService = inject(FSBTelemetryService);
  private readonly globeService = inject(GlobeVisualizationService);
  private readonly zone = inject(NgZone);

  readonly appVersion = APP_VERSION;
  readonly fallbackErrorMessage = $localize`:@@stats.error.default:Network or parse error.`;

  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('globeCanvas') globeCanvasRef?: ElementRef<HTMLCanvasElement>;

  readonly views: readonly ViewOption[] = [
    { id: 'stars-cumulative', label: $localize`:@@stats.view.cumulativeStars:Cumulative stars` },
    { id: 'issues-open-vs-closed', label: $localize`:@@stats.view.issues:Issues` },
    { id: 'commits-cumulative', label: $localize`:@@stats.view.cumulativeCommits:Cumulative commits` },
    { id: 'fsb-active-now', label: $localize`:@@SHOWCASE_STATS_FSB_VIEW_ACTIVE_NOW:Active right now` },
    { id: 'fsb-tokens', label: $localize`:@@SHOWCASE_STATS_FSB_VIEW_TOKENS:Tokens` },
    { id: 'fsb-popular-mcp', label: $localize`:@@SHOWCASE_STATS_FSB_VIEW_POPULAR_MCP:Popular MCP clients` },
  ];

  selectedView: AnyViewId = 'stars-cumulative';
  viewState: 'loading' | 'ready' | 'rate-limited' | 'error' = 'loading';
  rateLimitedUntil: Date | null = null;
  errorMessage = '';

  // Fan-picker UI state (redesign) -- fanOpen drives the hover-expanded side
  // menus, tabPulse is a brief "pop" on the newly-selected center pill, and
  // frozenView keeps the fan's split stable while it collapses so it doesn't
  // visibly reshuffle to the new selection's neighbors mid-fade.
  fanOpen = false;
  tabPulse = false;
  private frozenView: AnyViewId | null = null;
  private tabsHoverTimer?: ReturnType<typeof setTimeout>;
  private tabsCloseTimer?: ReturnType<typeof setTimeout>;
  private pulseTimer?: ReturnType<typeof setTimeout>;

  // Latest dataset snapshots, populated from subject subscriptions. We keep
  // these as fields (not signals) because the redraw cycle is driven by
  // setView() / new dataset arrival, not by Angular change-detection ticks.
  private latestStars: StarEvent[] = [];
  private latestWeeklyStars: WeeklyDelta[] = [];
  private latestIssues: IssueEvent[] = [];
  private latestCommits: CommitEvent[] = [];

  // Phase 274 / STATS-02 + STATS-03 -- FSB telemetry snapshots; template
  // reads `fsbHeadline` getter for the live headline row above the chart card.
  private latestFsbHeadline: FSBTelemetryHeadline | null = null;
  private latestFsbSeries: FSBTelemetrySeries | null = null;

  get fsbHeadline(): FSBTelemetryHeadline | null {
    return this.latestFsbHeadline;
  }

  get tabMetrics(): readonly TabMetric[] {
    const headline = this.latestFsbHeadline;
    switch (this.selectedView) {
      case 'stars-cumulative': {
        const cumulative = this.statsService.cumulativeStarsSeries(this.latestStars);
        const weekly = this.latestWeeklyStars.length
          ? this.latestWeeklyStars
          : this.statsService.weeklyStarsDelta(this.latestStars);
        return [
          { label: $localize`:@@stats.metric.totalStars:total stars`, value: this.fmtNum(cumulative.at(-1)?.y ?? 0) },
          { label: $localize`:@@stats.metric.last7Days:last 7 days`, value: this.fmtNum(weekly.at(-1)?.count ?? 0) },
        ];
      }
      case 'issues-open-vs-closed': {
        const { opened, closed } = this.statsService.issuesOpenVsClosed(this.latestIssues);
        const openedTotal = sumPoints(opened);
        const closedTotal = sumPoints(closed);
        return [
          { label: $localize`:@@stats.metric.open:open`, value: this.fmtNum(Math.max(0, openedTotal - closedTotal)) },
          { label: $localize`:@@stats.metric.closed:closed`, value: this.fmtNum(closedTotal) },
        ];
      }
      case 'commits-cumulative': {
        const cumulative = this.statsService.cumulativeCommitsSeries(this.latestCommits);
        return [
          { label: $localize`:@@stats.metric.totalCommits:total commits`, value: this.fmtNum(cumulative.at(-1)?.y ?? this.latestCommits.length) },
          { label: $localize`:@@stats.metric.last30Days:last 30 days`, value: this.fmtNum(countRecentCommits(this.latestCommits, 30)) },
        ];
      }
      case 'fsb-active-now':
        return [
          { label: $localize`:@@stats.metric.activeAgents:active agents`, value: this.fmtNum(headline?.active_agents_now ?? 0) },
          { label: $localize`:@@stats.metric.avgPerUser:avg per user`, value: (headline?.avg_agents_per_user ?? 0).toFixed(1) },
        ];
      case 'fsb-tokens':
        return [
          { label: $localize`:@@stats.metric.tokensLifetime:tokens lifetime`, value: this.fmtBig(headline?.tokens_total_lifetime ?? 0) },
          { label: $localize`:@@stats.metric.tokens24h:tokens 24h`, value: this.fmtBig(headline?.tokens_24h ?? 0) },
        ];
      case 'fsb-popular-mcp': {
        const list = headline?.popular_mcp_clients ?? [];
        const top = list[0];
        return [
          { label: $localize`:@@stats.metric.trackedClients:tracked clients`, value: this.fmtNum(list.length) },
          { label: top ? $localize`:@@stats.metric.topNamed:top: ${top.label}:entityLabel:` : $localize`:@@stats.metric.topClient:top client`, value: top ? this.fmtNum(top.uniq) : '0' },
        ];
      }
      default:
        // Every other StatsViewId member is no longer reachable via `views`
        // (Phase 274 redesign trimmed the tab list to 6) but the type itself
        // still spans github-stats.types.ts's full StatsViewId union.
        return [];
    }
  }

  get formattedFsbActive(): string {
    return this.fmtNum(this.latestFsbHeadline?.active_users_now ?? 0);
  }

  get formattedFsbTotal(): string {
    return this.fmtNum(this.latestFsbHeadline?.total_users ?? 0);
  }

  get formattedFsbTokens(): string {
    return this.fmtBig(this.latestFsbHeadline?.tokens_24h ?? 0);
  }

  get activeViewLabel(): string {
    return this.views.find((v) => v.id === this.selectedView)?.label ?? '';
  }

  // Redesign: whether the "Active now" globe has at least one geolocatable
  // region to glow. k>=5-anonymity-floored entries like 'unknown'/'Other'
  // (see region-geo.ts) don't count -- the annotation caption falls back to
  // an explicit "still gathering data" message when this is false rather
  // than silently showing a globe with no nodes.
  get hasPlottableRegions(): boolean {
    const regions = this.latestFsbHeadline?.popular_regions ?? [];
    return regions.some((r) => regionCentroid(r.label) !== null);
  }

  get fanItemsLeft(): readonly FanItem[] {
    return this.computeFanSplit().left;
  }

  get fanItemsRight(): readonly FanItem[] {
    return this.computeFanSplit().right;
  }

  // Chart.js Chart class -- captured from the dynamic import inside
  // afterNextRender. Typed `any` because we never import the type on the
  // server bundle.
  private ChartCtor: any = null;
  private chartInstance: any = null;
  // Cleanup for the "Active now" globe, set while it's running (see
  // GlobeVisualizationService.setupGlobe's return value).
  private stopGlobe?: () => void;
  // JSON snapshot of the popular_regions list backing the running globe --
  // lets redrawChart() keep the globe spinning across redraws that don't
  // change the region data. Meaningful only while stopGlobe is set.
  private lastGlobeKey = '';
  private pendingViewRedrawFrame: number | null = null;

  private subs: Subscription[] = [];
  private themeMedia: MediaQueryList | null = null;
  private readonly onThemeChange = () => this.redrawChart();

  constructor() {
    afterNextRender(() => {
      // Browser-only by Angular contract. Bootstrap Chart.js + the service
      // and wire up subscriptions. We re-render on every dataset update and
      // on view switches.
      void this.bootstrap();
      // readChartTokens() reads live CSS custom properties, so it already
      // tracks the OS theme; the chart itself still needs an explicit
      // redraw when those tokens change underneath it.
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        this.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
        this.themeMedia.addEventListener('change', this.onThemeChange);
      }
    });
  }

  ngOnInit(): void {
    // Runs on server + browser. Static head-only work: title + robots noindex.
    this.title.setTitle($localize`:@@stats.meta.title:FSB · Stats`);
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }

  ngAfterViewInit(): void {
    // No-op -- chart bootstrap is handled inside afterNextRender so the
    // canvas may not exist yet on first ngAfterViewInit (template @if
    // skeleton state). bootstrap() handles canvas availability defensively.
  }

  ngOnDestroy(): void {
    this.statsService.stop();
    // Phase 274 / STATS-03 -- mirror lifecycle for the FSB telemetry service.
    this.fsbService.stop();
    for (const s of this.subs) s.unsubscribe();
    this.subs = [];
    if (this.themeMedia) {
      this.themeMedia.removeEventListener('change', this.onThemeChange);
      this.themeMedia = null;
    }
    if (this.chartInstance) {
      try {
        this.chartInstance.destroy();
      } catch {
        /* swallow */
      }
      this.chartInstance = null;
    }
    this.stopGlobe?.();
    this.stopGlobe = undefined;
    this.cancelPendingViewRedraw();
    clearTimeout(this.tabsHoverTimer);
    clearTimeout(this.tabsCloseTimer);
    clearTimeout(this.pulseTimer);
  }

  setView(id: AnyViewId): void {
    clearTimeout(this.tabsHoverTimer);
    clearTimeout(this.tabsCloseTimer);
    clearTimeout(this.pulseTimer);
    if (this.selectedView === id) {
      // Re-selecting the active view is only reachable from the collapsing
      // fan while frozenView is set; the pulseTimer just cleared above was
      // due to reset that state, so reset it here or the fan stays keyed on
      // the stale frozenView until the next real view change.
      this.fanOpen = false;
      this.tabPulse = false;
      this.frozenView = null;
      return;
    }
    this.frozenView = this.selectedView;
    this.selectedView = id;
    this.fanOpen = false;
    this.tabPulse = true;
    this.pulseTimer = setTimeout(() => {
      this.tabPulse = false;
      this.frozenView = null;
    }, 360);
    // Defer one frame so Angular can apply the active globe/tab classes before
    // canvas measurements run.
    this.scheduleViewRedraw();
  }

  onTabsEnter(): void {
    clearTimeout(this.tabsCloseTimer);
    clearTimeout(this.tabsHoverTimer);
    this.tabsHoverTimer = setTimeout(() => {
      this.fanOpen = true;
    }, 100);
  }

  onTabsLeave(): void {
    clearTimeout(this.tabsHoverTimer);
    clearTimeout(this.tabsCloseTimer);
    this.tabsCloseTimer = setTimeout(() => {
      this.fanOpen = false;
    }, 250);
  }

  onTabsToggle(): void {
    clearTimeout(this.tabsHoverTimer);
    clearTimeout(this.tabsCloseTimer);
    this.fanOpen = !this.fanOpen;
  }

  trackByView(_index: number, opt: ViewOption): string {
    return opt.id;
  }

  trackByMetric(index: number, metric: TabMetric): string {
    return `${metric.label}:${index}`;
  }

  // Balanced circular split: walks outward from the active view in both
  // directions so both fans stay roughly even regardless of which of the 6
  // views is active, instead of dumping everything on one side when the
  // active tab sits at either end of the list. Keyed on frozenView while a
  // selection is collapsing so the folding list keeps its old tiles rather
  // than reshuffling to the new selection's neighbors mid-fade.
  private computeFanSplit(): { left: readonly FanItem[]; right: readonly FanItem[] } {
    const activeId = this.frozenView ?? this.selectedView;
    const idx = this.views.findIndex((v) => v.id === activeId);
    const n = this.views.length;
    const leftViews: ViewOption[] = [];
    const rightViews: ViewOption[] = [];
    for (let d = 1; d <= Math.floor(n / 2); d += 1) {
      const rightIdx = (idx + d) % n;
      const leftIdx = (((idx - d) % n) + n) % n;
      rightViews.push(this.views[rightIdx]);
      if (leftIdx !== rightIdx) leftViews.push(this.views[leftIdx]);
    }
    const maxLen = Math.max(leftViews.length, rightViews.length, 1);
    const toFanItems = (list: ViewOption[]): FanItem[] =>
      list.map((v, i) => this.fanItem(v, maxLen > 1 ? i / (maxLen - 1) : 0));
    return { left: toFanItems(leftViews), right: toFanItems(rightViews) };
  }

  private fanItem(v: ViewOption, t: number): FanItem {
    const ANGLE = Math.PI * 0.42;
    const ARC = 20;
    return { id: v.id, label: v.label, dy: -Math.round((1 - Math.cos(t * ANGLE)) * ARC) };
  }

  private fmtNum(value: number): string {
    return new Intl.NumberFormat(this.localeId).format(Math.round(value || 0));
  }

  private fmtBig(value: number): string {
    if (value >= 1_000) {
      return new Intl.NumberFormat(this.localeId, {
        maximumFractionDigits: 1,
        notation: 'compact',
      }).format(value);
    }
    return this.fmtNum(value);
  }

  private async bootstrap(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      // Dynamic import -- never bundled into the SSR pass.
      const chartMod = await import('chart.js/auto');
      this.ChartCtor = chartMod.default ?? chartMod;
    } catch (err) {
      console.warn('[stats-page] failed to load chart.js', err);
      this.viewState = 'error';
      this.errorMessage = $localize`:@@stats.error.chartLibrary:Could not load chart library.`;
      return;
    }

    this.statsService.start();

    // Wire the 4 dataset subjects the remaining views need. Any
    // "rate-limited" state flips the whole page into the rate-limit card;
    // any "error" updates the inline message.
    this.subs.push(this.statsService.stars$.subscribe((s) => this.onDatasetUpdate('stars', s)));
    this.subs.push(this.statsService.weeklyStars$.subscribe((s) => this.onDatasetUpdate('weeklyStars', s)));
    this.subs.push(this.statsService.issues$.subscribe((s) => this.onDatasetUpdate('issues', s)));
    this.subs.push(this.statsService.commits$.subscribe((s) => this.onDatasetUpdate('commits', s)));
    // repoSummary subscription is intentionally omitted from per-update redraw
    // because no chart view depends on it directly; we still surface its
    // rate-limit state for UI.
    this.subs.push(
      this.statsService.repoSummary$.subscribe((s) => {
        if (s.kind === 'rate-limited') this.applyRateLimit(s.resetAt);
      })
    );

    // Phase 274 / STATS-03 -- bring up the FSB telemetry stream alongside GitHub.
    // FSBTelemetryService never emits `rate-limited` (server endpoint is
    // server-cached, not rate-limited). On `error` we silently keep the prior
    // snapshot -- the GitHub side dominates the page's overall viewState
    // machine, so a transient FSB blip should not flip the whole page into an
    // error card.
    this.fsbService.start();
    this.subs.push(this.fsbService.headline$.subscribe((s) => this.onFsbHeadlineUpdate(s)));
    this.subs.push(this.fsbService.series$.subscribe((s) => this.onFsbSeriesUpdate(s)));
  }

  private onFsbHeadlineUpdate(state: FSBDatasetState<FSBTelemetryHeadline>): void {
    if (state.kind === 'ready') {
      this.latestFsbHeadline = state.data;
      if (this.viewState !== 'rate-limited') {
        this.viewState = 'ready';
        this.errorMessage = '';
        this.redrawChart();
      }
    }
    // `error` and `loading` fall through silently; the headline row is
    // conditionally rendered via @if (fsbHeadline) so a null snapshot just
    // hides the row.
  }

  private onFsbSeriesUpdate(state: FSBDatasetState<FSBTelemetrySeries>): void {
    if (state.kind === 'ready') {
      this.latestFsbSeries = state.data;
      if (this.viewState !== 'rate-limited') {
        this.viewState = 'ready';
        this.errorMessage = '';
        this.redrawChart();
      }
    }
  }

  private onDatasetUpdate(
    key: 'stars' | 'weeklyStars' | 'issues' | 'commits',
    state: DatasetState<unknown>
  ): void {
    if (state.kind === 'rate-limited') {
      this.applyRateLimit(state.resetAt);
      return;
    }
    if (state.kind === 'error') {
      // Per-dataset error; only surface globally if we have nothing else.
      if (this.viewState === 'loading') {
        this.viewState = 'error';
        this.errorMessage = state.message;
      }
      return;
    }
    if (state.kind !== 'ready') return;

    switch (key) {
      case 'stars':
        this.latestStars = state.data as StarEvent[];
        break;
      case 'weeklyStars':
        this.latestWeeklyStars = state.data as WeeklyDelta[];
        break;
      case 'issues':
        this.latestIssues = state.data as IssueEvent[];
        break;
      case 'commits':
        this.latestCommits = state.data as CommitEvent[];
        break;
    }
    if (this.viewState !== 'rate-limited') {
      this.viewState = 'ready';
      this.errorMessage = '';
      this.redrawChart();
    }
  }

  private applyRateLimit(resetAt: number): void {
    // Leaving 'ready' unmounts the @if template branch that owns the globe
    // canvas; stop the globe's rAF loop so it doesn't keep rendering to the
    // detached canvas (no redraw runs while rate-limited to stop it later).
    this.stopGlobe?.();
    this.stopGlobe = undefined;
    this.viewState = 'rate-limited';
    this.rateLimitedUntil = new Date(resetAt);
  }

  private scheduleViewRedraw(): void {
    this.cancelPendingViewRedraw();
    if (
      !isPlatformBrowser(this.platformId) ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      this.redrawChart();
      return;
    }
    this.pendingViewRedrawFrame = window.requestAnimationFrame(() => {
      this.pendingViewRedrawFrame = null;
      this.redrawChart();
    });
  }

  private cancelPendingViewRedraw(): void {
    if (
      this.pendingViewRedrawFrame !== null &&
      typeof window !== 'undefined' &&
      typeof window.cancelAnimationFrame === 'function'
    ) {
      window.cancelAnimationFrame(this.pendingViewRedrawFrame);
    }
    this.pendingViewRedrawFrame = null;
  }

  private redrawChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.ChartCtor) return;

    if (this.selectedView === 'fsb-active-now') {
      const key = JSON.stringify(this.latestFsbHeadline?.popular_regions ?? []);
      // Globe already running on the same region data (poll ticks re-emit
      // unchanged aggregates; theme flips are read per frame by the draw
      // loop): keep it spinning instead of resetting rotation + refetching
      // coastlines. The key is order-sensitive -- a server-side reorder just
      // costs one harmless rebuild.
      if (this.stopGlobe && key === this.lastGlobeKey) return;
      this.stopGlobe?.();
      this.stopGlobe = undefined;
      if (this.chartInstance) {
        try { this.chartInstance.destroy(); } catch { /* swallow */ }
        this.chartInstance = null;
      }
      this.clearSankeySvg();
      const globeCanvas = this.globeCanvasRef?.nativeElement;
      if (globeCanvas) {
        this.lastGlobeKey = key;
        this.stopGlobe = this.zone.runOutsideAngular(() =>
          this.globeService.setupGlobe(globeCanvas, this.buildGlobeRegions())
        );
      }
      return;
    }

    // Any chart view: tear down a globe left over from the globe view.
    this.stopGlobe?.();
    this.stopGlobe = undefined;

    const canvasRef = this.chartCanvas;
    if (!canvasRef) return; // template not yet in `ready` branch.
    const canvas = canvasRef.nativeElement;
    if (!canvas) return;

    // Destroy prior chart before mounting the next one.
    if (this.chartInstance) {
      try {
        this.chartInstance.destroy();
      } catch {
        /* swallow */
      }
      this.chartInstance = null;
    }

    // Quick task 260515-kw1 -- Sankey branch renders inline SVG instead of a
    // Chart.js config. Hide the canvas while this view is active so the SVG
    // can take the .chart-mount real estate.
    if (this.selectedView === 'issues-open-vs-closed') {
      try { canvas.style.display = 'none'; } catch { /* swallow */ }
      this.renderSankeySvg();
      return;
    }

    // For every other view, ensure the canvas is visible (a prior Sankey
    // render may have hidden it) and the SVG host is cleared.
    try { canvas.style.display = ''; } catch { /* swallow */ }
    this.clearSankeySvg();

    const config = this.buildChartConfig();
    if (!config) return;
    try {
      this.chartInstance = new this.ChartCtor(canvas, config);
    } catch (err) {
      console.warn('[stats-page] chart render failed', err);
    }
  }

  // Redesign -- maps the k>=5-anonymity-floored popular_regions breakdown
  // (see fsb-telemetry.types.ts) to globe node clusters. Labels that can't be
  // geolocated (unmapped, or the literal 'unknown'/'Other' k-floor buckets)
  // are skipped rather than guessed. `count` is a coarse, capped scale of
  // `uniq` (the k-floor already guarantees uniq >= 5 for any real entry) so
  // one dominant region can't visually swamp the globe; `spread` is a fixed
  // moderate jitter radius since we only have a single centroid per label,
  // not a real distribution.
  private buildGlobeRegions(): GlobeRegion[] {
    const list = this.latestFsbHeadline?.popular_regions ?? [];
    const regions: GlobeRegion[] = [];
    for (const { label, uniq } of list) {
      const centroid = regionCentroid(label);
      if (!centroid) continue;
      regions.push({
        lon: centroid.lon,
        lat: centroid.lat,
        spread: 6,
        count: Math.min(16, Math.max(2, Math.round(uniq / 5))),
      });
    }
    return regions;
  }

  /**
   * Quick task 260515-kw1 -- inline-SVG Sankey renderer for
   * issues-open-vs-closed. Two nodes (Opened on the left, Closed on the right)
   * with one flow path; backlog (O - C) is drawn as a thinner secondary flow
   * into a small "Open" node on the far right so the diagram has visual
   * meaning even when every issue is closed. Uses readChartTokens for theme.
   */
  private renderSankeySvg(): void {
    const canvasRef = this.chartCanvas;
    const mount = canvasRef?.nativeElement?.parentElement;
    if (!mount) return;

    this.clearSankeySvg();

    const { opened, closed } = this.statsService.issuesOpenVsClosed(this.latestIssues);
    const O = opened.reduce((acc, p) => acc + (p.y || 0), 0);
    const C = closed.reduce((acc, p) => acc + (p.y || 0), 0);
    const backlog = Math.max(0, O - C);
    const closedFlow = Math.max(0, Math.min(O, C));
    const tokens = readChartTokens();

    const VB_W = 600;
    const VB_H = 240;
    const nodeW = 18;
    const leftX = 60;
    const rightX = VB_W - 60 - nodeW;
    const maxBar = VB_H - 60;
    const oH = O > 0 ? maxBar : 0;
    const total = closedFlow + backlog || 1;
    const closedH = (closedFlow / total) * oH;
    const backlogH = (backlog / total) * oH;
    const oY = (VB_H - oH) / 2;
    const closedY = 30;
    const backlogY = VB_H - 30 - backlogH;

    // Two cubic Bezier flow paths from the right edge of the Opened node to
    // the left edge of the Closed / Backlog nodes. Stroke width = flow size.
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'sankey-svg');
    svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      $localize`:@@stats.chart.issuesSankey.aria:Sankey: ${O}:openedCount: opened, ${closedFlow}:closedCount: closed, ${backlog}:backlogCount: still open`
    );

    const mkPath = (y1: number, h1: number, y2: number, h2: number, fill: string): SVGPathElement => {
      const sx = leftX + nodeW;
      const ex = rightX;
      const mx = (sx + ex) / 2;
      const sy1 = y1;
      const sy2 = y1 + h1;
      const ey1 = y2;
      const ey2 = y2 + h2;
      const d = [
        `M ${sx} ${sy1}`,
        `C ${mx} ${sy1}, ${mx} ${ey1}, ${ex} ${ey1}`,
        `L ${ex} ${ey2}`,
        `C ${mx} ${ey2}, ${mx} ${sy2}, ${sx} ${sy2}`,
        'Z',
      ].join(' ');
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', fill);
      path.setAttribute('fill-opacity', '0.55');
      return path;
    };

    if (closedFlow > 0) {
      svg.appendChild(mkPath(oY, closedH, closedY, closedH, tokens.primary));
    }
    if (backlog > 0) {
      svg.appendChild(mkPath(oY + closedH, backlogH, backlogY, backlogH, tokens.muted));
    }

    // Nodes
    const mkRect = (x: number, y: number, w: number, h: number, fill: string): SVGRectElement => {
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', String(x));
      r.setAttribute('y', String(y));
      r.setAttribute('width', String(w));
      r.setAttribute('height', String(Math.max(2, h)));
      r.setAttribute('fill', fill);
      return r;
    };
    svg.appendChild(mkRect(leftX, oY, nodeW, oH, tokens.primary));
    svg.appendChild(mkRect(rightX, closedY, nodeW, Math.max(2, closedH), tokens.primary));
    svg.appendChild(mkRect(rightX, backlogY, nodeW, Math.max(2, backlogH), tokens.muted));

    const mkText = (x: number, y: number, anchor: string, fill: string, content: string): SVGTextElement => {
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', String(x));
      t.setAttribute('y', String(y));
      t.setAttribute('fill', fill);
      t.setAttribute('font-size', '13');
      t.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif');
      t.setAttribute('text-anchor', anchor);
      t.textContent = content;
      return t;
    };
    svg.appendChild(mkText(leftX - 8, oY - 8, 'end', tokens.text, $localize`:@@stats.chart.issuesSankey.opened:Opened (${O}:openedCount:)`));
    svg.appendChild(mkText(rightX + nodeW + 8, closedY + Math.max(closedH, 12) / 2, 'start', tokens.text, $localize`:@@stats.chart.issuesSankey.closed:Closed (${closedFlow}:closedCount:)`));
    if (backlog > 0) {
      svg.appendChild(mkText(rightX + nodeW + 8, backlogY + Math.max(backlogH, 12) / 2, 'start', tokens.muted, $localize`:@@stats.chart.issuesSankey.stillOpen:Still open (${backlog}:backlogCount:)`));
    }

    mount.appendChild(svg);
  }

  private clearSankeySvg(): void {
    const canvasRef = this.chartCanvas;
    const mount = canvasRef?.nativeElement?.parentElement;
    if (!mount) return;
    const prior = mount.querySelector('.sankey-svg');
    if (prior) {
      try { prior.remove(); } catch { /* swallow */ }
    }
  }

  private buildChartConfig(): unknown {
    const tokens = readChartTokens();
    const baseScales = {
      x: {
        ticks: { color: tokens.muted },
        grid: { color: tokens.border },
      },
      y: {
        ticks: { color: tokens.muted },
        grid: { color: tokens.border },
        beginAtZero: true,
      },
    };
    const baseOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: tokens.text } },
        tooltip: { enabled: true },
      },
      scales: baseScales,
    };

    switch (this.selectedView) {
      case 'stars-cumulative': {
        const series = this.statsService.cumulativeStarsSeries(this.latestStars);
        return {
          type: 'line',
          data: {
            labels: series.map((p) => p.t),
            datasets: [
              {
                label: $localize`:@@stats.chart.cumulativeStars.legend:Cumulative stars`,
                data: series.map((p) => p.y),
                borderColor: tokens.primary,
                backgroundColor: tokens.primarySoft,
                fill: true,
                tension: 0.2,
              },
            ],
          },
          options: baseOpts,
        };
      }
      case 'issues-open-vs-closed': {
        // Quick task 260515-kw1 -- handled by renderSankeySvg() above; the
        // early-return in redrawChart() short-circuits before reaching here.
        // We still need a `case` arm so the switch is exhaustive over AnyViewId.
        return null;
      }
      case 'commits-cumulative': {
        const series = this.statsService.cumulativeCommitsSeries(this.latestCommits);
        return {
          type: 'line',
          data: {
            labels: series.map((p) => p.t),
            datasets: [
              {
                label: $localize`:@@stats.chart.cumulativeCommits.legend:Cumulative commits`,
                data: series.map((p) => p.y),
                borderColor: tokens.primary,
                backgroundColor: tokens.primarySoft,
                fill: true,
                tension: 0.2,
              },
            ],
          },
          options: baseOpts,
        };
      }
      // -----------------------------------------------------------------
      // Phase 274 / STATS-01 -- FSB telemetry chart views. Each renders an
      // empty axis when the data hasn't arrived yet so Chart.js never
      // crashes on null inputs. fsb-active-now has no arm here -- it's
      // rendered as the region globe (redrawChart() returns before reaching
      // buildChartConfig for that view).
      // -----------------------------------------------------------------
      case 'fsb-tokens': {
        const pts = this.latestFsbSeries?.d30 ?? [];
        return {
          type: 'line',
          data: {
            labels: pts.map((p) => p.day_utc),
            datasets: [
              {
                label: $localize`:@@SHOWCASE_STATS_FSB_CHART_TOKENS_LEGEND:Tokens (last 30 days)`,
                data: pts.map((p) => p.tokens),
                borderColor: tokens.primary,
                backgroundColor: tokens.primarySoft,
                fill: true,
                tension: 0.2,
              },
            ],
          },
          options: baseOpts,
        };
      }
      case 'fsb-popular-mcp': {
        const raw = this.latestFsbHeadline?.popular_mcp_clients ?? [];
        const list = raw.length > 0
          ? raw
          : [{ label: $localize`:@@SHOWCASE_STATS_FSB_CHART_PENDING_MCP:Pending (k>=5 floor)`, uniq: 1 }];
        return {
          type: 'doughnut',
          data: {
            labels: list.map((x) => x.label),
            datasets: [
              {
                label: $localize`:@@SHOWCASE_STATS_FSB_CHART_POPULAR_MCP_LEGEND:Popular MCP clients`,
                data: list.map((x) => x.uniq),
                backgroundColor: [
                  tokens.primary, tokens.primarySoft, tokens.muted,
                  tokens.border, tokens.text, '#a78bfa', '#34d399',
                ],
              },
            ],
          },
          options: baseOpts,
        };
      }
      default:
        // Every other AnyViewId member is no longer reachable via `views`
        // (Phase 274 redesign trimmed the tab list to 6; fsb-active-now is
        // handled before this method is ever called for that view).
        return null;
    }
  }
}

interface ChartTokens {
  primary: string;
  primarySoft: string;
  text: string;
  muted: string;
  border: string;
}

function readChartTokens(): ChartTokens {
  // Pull the CSS-custom-property tokens from the computed style of <html>
  // so chart colors track the active theme automatically.
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return {
      primary: '#ff6b35',
      primarySoft: 'rgba(255, 107, 53, 0.12)',
      text: '#f1f5f9',
      muted: '#94a3b8',
      border: 'rgba(255, 255, 255, 0.08)',
    };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    primary: (style.getPropertyValue('--primary') || '#ff6b35').trim(),
    primarySoft: (style.getPropertyValue('--fsb-primary-soft') || 'rgba(255, 107, 53, 0.12)').trim(),
    text: (style.getPropertyValue('--text-primary') || '#f1f5f9').trim(),
    muted: (style.getPropertyValue('--text-secondary') || '#94a3b8').trim(),
    border: (style.getPropertyValue('--border-color') || 'rgba(255,255,255,0.08)').trim(),
  };
}

function sumPoints(points: ReadonlyArray<{ y: number }>): number {
  return points.reduce((total, point) => total + (Number.isFinite(point.y) ? point.y : 0), 0);
}

function countRecentCommits(commits: readonly CommitEvent[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return commits.filter((commit) => {
    const date = Date.parse(commit.commit?.author?.date ?? '');
    return Number.isFinite(date) && date >= cutoff;
  }).length;
}
