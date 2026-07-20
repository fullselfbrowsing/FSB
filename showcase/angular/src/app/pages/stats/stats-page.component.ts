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
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { APP_VERSION } from '../../core/seo/version';
import { GitHubStatsService } from '../../core/stats/github-stats.service';
import {
  DatasetState,
  GitHubCommitsStats,
  GitHubStarsStats,
  StatsViewId,
} from '../../core/stats/github-stats.types';
import { FSBTelemetryService } from '../../core/stats/fsb-telemetry.service';
import {
  DatasetState as FSBDatasetState,
  FSBTelemetryHeadline,
  FSBTelemetrySeries,
} from '../../core/stats/fsb-telemetry.types';
import {
  activeSnapshotDatasetState,
  aggregateDatasetState,
  combineDatasetStates,
  initialStatsSourceStates,
  rollingSevenDayStars,
  selectedStatsViewState,
  sourcesForStatsView,
  StatsDataSource,
  StatsSourceStateMap,
  StatsViewDataState,
  updateStatsSourceState,
} from '../../core/stats/stats-view.model';
import { regionCentroid } from '../../core/stats/region-geo';
import { GlobeVisualizationService } from '../../core/globe/globe-visualization.service';
import { GlobeRegion } from '../../core/globe/globe-visualization.types';
import { LanguagePickerComponent } from '../../layout/language-picker/language-picker.component';

// The picker combines two GitHub aggregate views with three FSB telemetry
// views. The local union keeps component switches limited to those five.
export type FSBViewId = 'fsb-active-now' | 'fsb-tokens' | 'fsb-popular-mcp';
export type GitHubViewId = Extract<
  StatsViewId,
  'stars-cumulative' | 'commits-cumulative'
>;
export type AnyViewId = GitHubViewId | FSBViewId;

interface ViewOption {
  id: AnyViewId;
  label: string;
}

interface TabMetric {
  label: string;
  value: string;
}

interface AccessibleDatum {
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
  imports: [CommonModule, RouterLink, LanguagePickerComponent],
  templateUrl: './stats-page.component.html',
  styleUrl: './stats-page.component.scss',
})
export class StatsPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
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
  @ViewChild('activeViewButton') activeViewButton?: ElementRef<HTMLButtonElement>;

  readonly views: readonly ViewOption[] = [
    { id: 'stars-cumulative', label: $localize`:@@stats.view.cumulativeStars:Stars` },
    { id: 'commits-cumulative', label: $localize`:@@stats.view.cumulativeCommits:Commits` },
    { id: 'fsb-active-now', label: $localize`:@@SHOWCASE_STATS_FSB_VIEW_ACTIVE:Active now` },
    { id: 'fsb-tokens', label: $localize`:@@SHOWCASE_STATS_FSB_VIEW_TOKENS:Tokens` },
    { id: 'fsb-popular-mcp', label: $localize`:@@SHOWCASE_STATS_FSB_VIEW_POPULAR_MCP:Popular` },
  ];

  selectedView: AnyViewId = 'stars-cumulative';
  private sourceStates: StatsSourceStateMap = initialStatsSourceStates();
  private chartLibraryState: 'loading' | 'ready' | 'error' = 'loading';

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
  private latestStars: GitHubStarsStats | null = null;
  private latestCommits: GitHubCommitsStats | null = null;

  // Phase 274 / STATS-02 + STATS-03 -- FSB telemetry snapshots; template
  // reads `fsbHeadline` getter for the live headline row above the chart card.
  private latestFsbHeadline: FSBTelemetryHeadline | null = null;
  private latestFsbSeries: FSBTelemetrySeries | null = null;

  get fsbHeadline(): FSBTelemetryHeadline | null {
    return this.latestFsbHeadline;
  }

  get viewState(): StatsViewDataState {
    const dataState = selectedStatsViewState(this.selectedView, this.sourceStates);
    if (dataState.kind === 'error' || dataState.kind === 'loading') return dataState;
    if (this.requiresChartLibrary && this.chartLibraryState === 'loading') return { kind: 'loading' };
    if (this.requiresChartLibrary && this.chartLibraryState === 'error') {
      return {
        kind: 'error',
        message: $localize`:@@stats.error.chartLibrary:Could not load chart library.`,
      };
    }
    if (this.requiresChartLibrary && this.chartRenderErrorView === this.selectedView) {
      return {
        kind: 'error',
        message: this.chartRenderErrorMessage ||
          $localize`:@@stats.error.chartRender:Could not render the selected chart.`,
      };
    }
    return dataState;
  }

  get isViewRenderable(): boolean {
    return this.viewState.kind === 'ready' ||
      this.viewState.kind === 'partial' ||
      this.viewState.kind === 'stale';
  }

  get fsbSummaryState(): StatsViewDataState {
    return combineDatasetStates([
      this.sourceStates['fsb-active'],
      this.sourceStates['fsb-headline'],
    ]);
  }

  get hasFsbHeadlineSnapshot(): boolean {
    const state = this.fsbSummaryState;
    return this.latestFsbHeadline !== null &&
      (state.kind === 'ready' || state.kind === 'partial' || state.kind === 'stale');
  }

  get isFsbActiveSnapshotCurrent(): boolean {
    const state = this.sourceStates['fsb-active'];
    return state.kind === 'ready' || state.kind === 'partial';
  }

  get isMcpEmpty(): boolean {
    return this.selectedView === 'fsb-popular-mcp' &&
      this.latestFsbHeadline !== null &&
      this.latestFsbHeadline.popular_mcp_clients.length === 0;
  }

  get stateBadgeTitle(): string {
    return this.formatStateTitle(this.viewState);
  }

  private formatStateTitle(state: StatsViewDataState): string {
    if (state.kind === 'ready' || state.kind === 'partial' || state.kind === 'stale') {
      const formatted = new Intl.DateTimeFormat(this.localeId, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(state.fetchedAt);
      if (state.kind === 'ready') {
        return $localize`:@@stats.status.freshAt:Fresh snapshot checked ${formatted}:checkedAt:`;
      }
      return state.kind === 'partial'
        ? $localize`:@@stats.status.partialAt:Partial snapshot checked ${formatted}:checkedAt:`
        : $localize`:@@stats.status.staleAt:Stale snapshot from ${formatted}:fetchedAt:`;
    }
    return state.kind === 'loading'
      ? $localize`:@@stats.status.loading:Loading selected stats`
      : $localize`:@@stats.status.unavailable:Selected stats unavailable`;
  }

  get errorMessage(): string {
    const state = this.viewState;
    return state.kind === 'error' ? state.message : '';
  }

  get chartAriaLabel(): string {
    switch (this.selectedView) {
      case 'stars-cumulative':
        return $localize`:@@stats.chart.stars.aria:Cumulative repository stars over time`;
      case 'commits-cumulative':
        return $localize`:@@stats.chart.commits.aria:Cumulative repository commits over time`;
      case 'fsb-tokens':
        return $localize`:@@stats.chart.tokens.aria:FSB token usage over the last 30 days`;
      case 'fsb-popular-mcp':
        return $localize`:@@stats.chart.mcp.aria:Share of tracked MCP clients`;
      default:
        return this.activeViewLabel;
    }
  }

  get accessibleChartData(): readonly AccessibleDatum[] {
    switch (this.selectedView) {
      case 'stars-cumulative':
        return (this.latestStars?.history ?? []).map((point) => ({
          label: point.day_utc,
          value: this.fmtNum(point.total),
        }));
      case 'commits-cumulative':
        return (this.latestCommits?.history ?? []).map((point) => ({
          label: point.day_utc,
          value: this.fmtNum(point.total),
        }));
      case 'fsb-tokens':
        return (this.latestFsbSeries?.d30 ?? []).map((point) => ({
          label: point.day_utc,
          value: this.fmtBig(point.tokens),
        }));
      case 'fsb-popular-mcp':
        return (this.latestFsbHeadline?.popular_mcp_clients ?? []).map((item) => ({
          label: item.label,
          value: this.fmtNum(item.uniq),
        }));
      default:
        return [];
    }
  }

  get accessibleGlobeData(): readonly AccessibleDatum[] {
    return (this.latestFsbHeadline?.popular_regions ?? []).map((item) => ({
      label: item.label,
      value: this.fmtNum(item.uniq),
    }));
  }

  get globeAriaLabel(): string {
    return $localize`:@@stats.globe.aria:Globe showing today's hourly FSB regional distribution`;
  }

  get tabMetrics(): readonly TabMetric[] {
    const headline = this.latestFsbHeadline;
    switch (this.selectedView) {
      case 'stars-cumulative': {
        const rolling = this.latestStars ? rollingSevenDayStars(this.latestStars) : null;
        return [
          { label: $localize`:@@stats.metric.totalStars:total stars`, value: this.fmtNum(this.latestStars?.total ?? 0) },
          { label: $localize`:@@stats.metric.last7Days:last 7 days`, value: rolling === null ? '—' : this.fmtNum(rolling) },
        ];
      }
      case 'commits-cumulative': {
        const commitsComplete = this.latestCommits?.history_complete !== false;
        return [
          {
            label: $localize`:@@stats.metric.totalCommits:total commits`,
            value: `${commitsComplete ? '' : '≥'}${this.fmtNum(this.latestCommits?.total ?? 0)}`,
          },
          {
            label: $localize`:@@stats.metric.last30Days:last 30 days`,
            value: `${commitsComplete ? '' : '≥'}${this.fmtNum(this.latestCommits?.last_30_days ?? 0)}`,
          },
        ];
      }
      case 'fsb-active-now': {
        const reportingUsers = headline?.active_agents_reporting_users_now;
        const hasTrustedActiveCount = Number(headline?.active_count_version) >= 2 &&
          headline?.active_metric_semantics === 'reported_registry_count_v2' &&
          typeof reportingUsers === 'number' && Number.isInteger(reportingUsers) &&
          reportingUsers > 0;
        const reportedAverage = headline?.avg_agents_per_reporting_user;
        return [
          {
            label: $localize`:@@stats.metric.activeAgents:active agents`,
            value: hasTrustedActiveCount ? this.fmtNum(headline?.active_agents_now ?? 0) : '—',
          },
          {
            label: $localize`:@@stats.metric.avgPerUser:avg/reporting user`,
            value: hasTrustedActiveCount &&
              typeof reportedAverage === 'number' && Number.isFinite(reportedAverage)
              ? reportedAverage.toFixed(1)
              : '—',
          },
        ];
      }
      case 'fsb-tokens':
        return [
          { label: $localize`:@@stats.metric.tokensLifetime:tokens`, value: this.fmtBig(headline?.tokens_total_lifetime ?? 0) },
          { label: $localize`:@@stats.metric.tokens24h:tokens (24h)`, value: this.fmtBig(headline?.tokens_24h ?? 0) },
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
        // Legacy GitHub helper view IDs are not exposed by this page.
        return [];
    }
  }

  get formattedFsbActive(): string {
    return this.fmtNum(this.latestFsbHeadline?.active_users_now ?? 0);
  }

  get formattedFsbTotal(): string {
    return this.fmtNum(
      this.latestFsbHeadline?.users_365d ?? this.latestFsbHeadline?.total_users ?? 0
    );
  }

  get formattedFsbAgentDays(): string {
    return this.fmtBig(this.latestFsbHeadline?.agent_days_since_active_v2 ?? 0);
  }

  get hasFsbAgentDaysSinceActiveV2(): boolean {
    return typeof this.latestFsbHeadline?.agent_days_since_active_v2 === 'number' &&
      Number.isFinite(this.latestFsbHeadline.agent_days_since_active_v2);
  }

  get formattedFsbTokens(): string {
    return this.fmtBig(this.latestFsbHeadline?.tokens_24h ?? 0);
  }

  get activeViewLabel(): string {
    return this.views.find((v) => v.id === this.selectedView)?.label ?? '';
  }

  get viewPickerAriaLabel(): string {
    return $localize`:@@stats.view.currentAria:Choose stats view. Current view: ${this.activeViewLabel}:viewLabel:`;
  }

  private get requiresChartLibrary(): boolean {
    return this.selectedView === 'stars-cumulative' ||
      this.selectedView === 'commits-cumulative' ||
      this.selectedView === 'fsb-tokens' ||
      (this.selectedView === 'fsb-popular-mcp' && !this.isMcpEmpty);
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

  get regionAggregateState(): 'ready' | 'partial' | 'stale' | 'unavailable' {
    const state = this.sourceStates['fsb-headline'];
    if (state.kind === 'ready') return 'ready';
    if (state.kind === 'partial') return 'partial';
    if (state.kind === 'stale') return 'stale';
    return 'unavailable';
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
  private chartRenderErrorView: AnyViewId | null = null;
  private chartRenderErrorMessage = '';
  // Cleanup for the "Active now" globe, set while it's running (see
  // GlobeVisualizationService.setupGlobe's return value).
  private stopGlobe?: () => void;
  // JSON snapshot of the popular_regions list backing the running globe --
  // lets redrawChart() keep the globe spinning across redraws that don't
  // change the region data. Meaningful only while stopGlobe is set.
  private lastGlobeKey = '';
  private pendingViewRedrawFrame: number | null = null;

  private subs: Subscription[] = [];
  // Set by ngOnDestroy so the async bootstrap() can tell when it lost the
  // race against a route change (see the guard after the chart.js import).
  private destroyed = false;
  private themeMedia: MediaQueryList | null = null;
  private motionMedia: MediaQueryList | null = null;
  private prefersReducedMotion = false;
  private readonly onThemeChange = () => this.scheduleViewRedraw();
  private readonly onMotionChange = (event: MediaQueryListEvent) => {
    this.prefersReducedMotion = event.matches;
    this.stopGlobe?.();
    this.stopGlobe = undefined;
    this.lastGlobeKey = '';
    this.scheduleViewRedraw();
  };

  constructor() {
    afterNextRender(() => {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        this.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
        this.themeMedia.addEventListener('change', this.onThemeChange);
        this.motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.prefersReducedMotion = this.motionMedia.matches;
        this.motionMedia.addEventListener('change', this.onMotionChange);
      }
      this.bootstrapData();
      void this.bootstrapChart();
    });
  }

  ngOnInit(): void {
    // Runs on server + browser. Static head-only work: metadata + robots noindex.
    this.title.setTitle($localize`:@@stats.meta.title:FSB · Stats`);
    this.doc.head
      .querySelectorAll(
        'link[rel="canonical"], link[rel="alternate"], script[data-ld], meta[property^="og:"], meta[name^="twitter:"]'
      )
      .forEach((node) => node.remove());
    this.meta.updateTag({
      name: 'description',
      content: $localize`:@@stats.meta.description:Live aggregate adoption, usage, and repository signals for FSB.`,
    });
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }

  ngAfterViewInit(): void {
    // No-op -- chart bootstrap is handled inside afterNextRender so the
    // canvas may not exist yet on first ngAfterViewInit (template @if
    // skeleton state). bootstrap() handles canvas availability defensively.
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.statsService.stop();
    // Phase 274 / STATS-03 -- mirror lifecycle for the FSB telemetry service.
    this.fsbService.stop();
    for (const s of this.subs) s.unsubscribe();
    this.subs = [];
    if (this.themeMedia) {
      this.themeMedia.removeEventListener('change', this.onThemeChange);
      this.themeMedia = null;
    }
    if (this.motionMedia) {
      this.motionMedia.removeEventListener('change', this.onMotionChange);
      this.motionMedia = null;
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
    this.meta.removeTag('name="robots"');
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
    this.clearChartRenderError(id);
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

  selectFanView(id: AnyViewId): void {
    this.setView(id);
    // Keyboard activation otherwise leaves focus on a fan item that becomes
    // visibility:hidden as soon as setView() collapses the disclosure.
    this.activeViewButton?.nativeElement.focus();
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

  onViewPickerKeydown(event: KeyboardEvent): void {
    const current = this.views.findIndex((view) => view.id === this.selectedView);
    let next = current;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % this.views.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + this.views.length) % this.views.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = this.views.length - 1;
        break;
      case 'Escape':
        this.fanOpen = false;
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    this.setView(this.views[next].id);
    this.activeViewButton?.nativeElement.focus();
  }

  trackByView(_index: number, opt: ViewOption): string {
    return opt.id;
  }

  trackByMetric(index: number, metric: TabMetric): string {
    return `${metric.label}:${index}`;
  }

  // Balanced circular split: walks outward from the active view in both
  // directions so both fans stay even regardless of which of the 5
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

  private bootstrapData(): void {
    if (!isPlatformBrowser(this.platformId) || this.destroyed) return;
    this.sourceStates = initialStatsSourceStates();

    // start() synchronously resets singleton subjects to loading before the
    // subscriptions attach, so a snapshot from a previous route visit cannot
    // flash as ready in this component.
    this.statsService.start();
    this.fsbService.start();
    this.subs.push(
      this.statsService.stars$.subscribe((state) => this.onSourceUpdate('stars', state)),
      this.statsService.commits$.subscribe((state) => this.onSourceUpdate('commits', state)),
      this.fsbService.headline$.subscribe((state) => this.onFsbHeadlineUpdate(state)),
      this.fsbService.series$.subscribe((state) => this.onFsbSeriesUpdate(state))
    );
  }

  private async bootstrapChart(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const chartMod = await import('chart.js/auto');
      if (this.destroyed) return;
      this.ChartCtor = chartMod.default ?? chartMod;
      this.chartLibraryState = 'ready';
      this.scheduleViewRedraw();
    } catch (err) {
      console.warn('[stats-page] failed to load chart.js', err);
      if (this.destroyed) return;
      this.chartLibraryState = 'error';
      this.scheduleViewRedraw();
    }
  }

  private onFsbHeadlineUpdate(state: FSBDatasetState<FSBTelemetryHeadline>): void {
    if (state.kind === 'ready' || state.kind === 'partial' || state.kind === 'stale') {
      this.latestFsbHeadline = state.data;
    }
    if (state.kind === 'ready') {
      this.onSourceState(
        'fsb-active',
        activeSnapshotDatasetState(state.data, state.fetchedAt)
      );
      this.onSourceState(
        'fsb-headline',
        aggregateDatasetState(state.data, state.fetchedAt)
      );
    } else {
      this.onSourceState('fsb-active', state);
      this.onSourceState('fsb-headline', state);
    }
  }

  private onFsbSeriesUpdate(state: FSBDatasetState<FSBTelemetrySeries>): void {
    if (state.kind === 'ready' || state.kind === 'partial' || state.kind === 'stale') {
      this.latestFsbSeries = state.data;
    }
    this.onSourceState(
      'fsb-series',
      state.kind === 'ready' ? aggregateDatasetState(state.data, state.fetchedAt) : state
    );
  }

  private onSourceUpdate(key: 'stars' | 'commits', state: DatasetState<unknown>): void {
    if (state.kind === 'ready' || state.kind === 'partial' || state.kind === 'stale') {
    switch (key) {
      case 'stars':
          this.latestStars = state.data as GitHubStarsStats;
        break;
      case 'commits':
          this.latestCommits = state.data as GitHubCommitsStats;
        break;
      }
    }
    this.onSourceState(key, state);
  }

  private onSourceState(
    source: StatsDataSource,
    state: DatasetState<unknown> | FSBDatasetState<unknown>
  ): void {
    this.sourceStates = updateStatsSourceState(
      this.sourceStates,
      source,
      state as DatasetState<unknown>
    );
    if (!sourcesForStatsView(this.selectedView).includes(source)) return;
    if (state.kind === 'ready' || state.kind === 'partial' || state.kind === 'stale') {
      this.clearChartRenderError(this.selectedView);
    }
    if (!this.isViewRenderable) this.teardownVisualization();
    this.scheduleViewRedraw();
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
    if (!this.isViewRenderable) {
      this.teardownVisualization();
      return;
    }

    if (this.selectedView === 'fsb-active-now') {
      const key = JSON.stringify({
        regions: this.latestFsbHeadline?.popular_regions ?? [],
        reducedMotion: this.prefersReducedMotion,
        theme: typeof document === 'undefined'
          ? ''
          : document.documentElement.getAttribute('data-theme'),
      });
      if (this.stopGlobe && key === this.lastGlobeKey) return;
      this.stopGlobe?.();
      this.stopGlobe = undefined;
      if (this.chartInstance) {
        try { this.chartInstance.destroy(); } catch { /* swallow */ }
        this.chartInstance = null;
      }
      const globeCanvas = this.globeCanvasRef?.nativeElement;
      if (globeCanvas) {
        this.lastGlobeKey = key;
        this.stopGlobe = this.zone.runOutsideAngular(() =>
          this.globeService.setupGlobe(
            globeCanvas,
            this.buildGlobeRegions(),
            undefined,
            !this.prefersReducedMotion
          )
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

    if (this.isMcpEmpty) {
      try { canvas.style.display = 'none'; } catch { /* swallow */ }
      return;
    }

    // Restore the canvas after leaving an empty MCP view.
    try { canvas.style.display = ''; } catch { /* swallow */ }

    try {
      if (!this.ChartCtor) return;
      const config = this.buildChartConfig();
      if (!config) return;
      this.chartInstance = new this.ChartCtor(canvas, config);
      this.clearChartRenderError(this.selectedView);
    } catch (err) {
      console.warn('[stats-page] chart render failed', err);
      this.zone.run(() => {
        this.chartRenderErrorView = this.selectedView;
        this.chartRenderErrorMessage =
          $localize`:@@stats.error.chartRender:Could not render the selected chart.`;
        this.teardownVisualization();
      });
    }
  }

  private clearChartRenderError(view: AnyViewId): void {
    if (this.chartRenderErrorView !== view) return;
    this.chartRenderErrorView = null;
    this.chartRenderErrorMessage = '';
  }

  private teardownVisualization(): void {
    this.stopGlobe?.();
    this.stopGlobe = undefined;
    if (this.chartInstance) {
      try { this.chartInstance.destroy(); } catch { /* swallow */ }
      this.chartInstance = null;
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

  private buildChartConfig(): unknown {
    const tokens = readChartTokens();
    const formatDate = (value: unknown): string => {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) return '';
      return new Intl.DateTimeFormat(this.localeId, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(numeric);
    };
    const animation = this.prefersReducedMotion ? false : { duration: 400 };
    const lineOpts = {
      responsive: true,
      maintainAspectRatio: false,
      animation,
      parsing: false,
      plugins: {
        legend: { labels: { color: tokens.text } },
        tooltip: {
          enabled: true,
          callbacks: {
            title: (items: Array<{ parsed?: { x?: number } }>) =>
              formatDate(items[0]?.parsed?.x),
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: tokens.muted,
            maxTicksLimit: 8,
            callback: (value: unknown) => formatDate(value),
          },
          grid: { color: tokens.border },
        },
        y: {
          ticks: { color: tokens.muted },
          grid: { color: tokens.border },
          beginAtZero: true,
        },
      },
    };
    const doughnutOpts = {
      responsive: true,
      maintainAspectRatio: false,
      animation,
      plugins: {
        legend: { labels: { color: tokens.text } },
        tooltip: { enabled: true },
      },
    };
    const point = (day: string, value: number): { x: number; y: number } => ({
      x: Date.parse(`${day}T00:00:00Z`),
      y: value,
    });

    switch (this.selectedView) {
      case 'stars-cumulative': {
        const series = this.latestStars?.history ?? [];
        return {
          type: 'line',
          data: {
            datasets: [
              {
                label: $localize`:@@stats.chart.cumulativeStars.legend:Cumulative stars`,
                data: series.map((p) => point(p.day_utc, p.total)),
                borderColor: tokens.primary,
                backgroundColor: tokens.primarySoft,
                fill: true,
                tension: 0.2,
                pointRadius: 0,
                pointHitRadius: 8,
              },
            ],
          },
          options: lineOpts,
        };
      }
      case 'commits-cumulative': {
        const series = this.latestCommits?.history ?? [];
        return {
          type: 'line',
          data: {
            datasets: [
              {
                label: $localize`:@@stats.chart.cumulativeCommits.legend:Cumulative commits`,
                data: series.map((p) => point(p.day_utc, p.total)),
                borderColor: tokens.primary,
                backgroundColor: tokens.primarySoft,
                fill: true,
                tension: 0.2,
                pointRadius: 0,
                pointHitRadius: 8,
              },
            ],
          },
          options: lineOpts,
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
            datasets: [
              {
                label: $localize`:@@SHOWCASE_STATS_FSB_CHART_TOKENS_LEGEND:Tokens (last 30 days)`,
                data: pts.map((p) => point(p.day_utc, p.tokens)),
                borderColor: tokens.primary,
                backgroundColor: tokens.primarySoft,
                fill: true,
                tension: 0.2,
                pointRadius: 0,
                pointHitRadius: 8,
              },
            ],
          },
          options: lineOpts,
        };
      }
      case 'fsb-popular-mcp': {
        const list = this.latestFsbHeadline?.popular_mcp_clients ?? [];
        if (list.length === 0) return null;
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
          options: doughnutOpts,
        };
      }
      default:
        // fsb-active-now is rendered before this method is called.
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
