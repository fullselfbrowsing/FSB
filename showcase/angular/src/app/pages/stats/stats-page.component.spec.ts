import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { GlobeVisualizationService } from '../../core/globe/globe-visualization.service';
import { FSBTelemetryService } from '../../core/stats/fsb-telemetry.service';
import {
  DatasetState as FSBDatasetState,
  FSBTelemetryHeadline,
  FSBTelemetrySeries,
} from '../../core/stats/fsb-telemetry.types';
import { GitHubStatsService } from '../../core/stats/github-stats.service';
import {
  DatasetAvailability,
  DatasetState,
  GitHubCommitsStats,
  GitHubStarsStats,
} from '../../core/stats/github-stats.types';
import {
  AnyViewId,
  STATS_CHART_LOADER,
  StatsPageComponent,
} from './stats-page.component';

class FakeGitHubStatsService {
  readonly stars$ = new BehaviorSubject<DatasetState<GitHubStarsStats>>({ kind: 'loading' });
  readonly commits$ = new BehaviorSubject<DatasetState<GitHubCommitsStats>>({ kind: 'loading' });
  readonly start = jasmine.createSpy('githubStart');
  readonly stop = jasmine.createSpy('githubStop');
}

class FakeFSBTelemetryService {
  readonly headline$ = new BehaviorSubject<FSBDatasetState<FSBTelemetryHeadline>>({ kind: 'loading' });
  readonly series$ = new BehaviorSubject<FSBDatasetState<FSBTelemetrySeries>>({ kind: 'loading' });
  readonly start = jasmine.createSpy('fsbStart');
  readonly stop = jasmine.createSpy('fsbStop');
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function availability(
  snapshotAt: number | null = Date.now(),
  upstreamStatus = '200',
  checkedAt = Date.now()
): DatasetAvailability {
  return { snapshotAt, checkedAt, upstreamStatus };
}

function readyState<T>(
  data: T,
  sourceAvailability = availability()
): DatasetState<T> {
  return { kind: 'ready', data, availability: sourceAvailability };
}

function stars(total = 12, historyComplete = true): GitHubStarsStats {
  return {
    schema_version: 1,
    total,
    history: [{ day_utc: '2026-07-21', total }],
    history_complete: historyComplete,
    source: 'repository-count',
    as_of: '2026-07-21T12:00:00Z',
  };
}

function starState(
  snapshotAt = Date.now(),
  upstreamStatus = '200',
  historyComplete = true
): DatasetState<GitHubStarsStats> {
  return readyState(
    stars(12, historyComplete),
    availability(snapshotAt, upstreamStatus)
  );
}

function commits(historyComplete = true): GitHubCommitsStats {
  return {
    schema_version: 1,
    total: 20,
    last_30_days: 4,
    history: [{ day_utc: '2026-07-21', total: 20 }],
    history_complete: historyComplete,
    as_of: new Date().toISOString(),
  };
}

function fsbHeadline(
  overrides: Partial<FSBTelemetryHeadline> = {}
): FSBTelemetryHeadline {
  const now = new Date().toISOString();
  return {
    generated_at: now,
    aggregate_as_of_day: now.slice(0, 10),
    aggregate_updated_at: now,
    active_users_now: 2,
    active_agents_now: 3,
    active_agents_reporting_users_now: 2,
    active_agents_coverage: 1,
    active_agents_bucket: '2-4',
    active_count_version: 2,
    active_history_since: '2026-07-01',
    active_history_complete: true,
    active_metric_semantics: 'reported_registry_count_v2',
    total_users: 4,
    users_365d: 4,
    total_agents_lifetime: null,
    agent_days_lifetime: null,
    agent_days_since_active_v2: 8,
    tokens_total_lifetime: 1000,
    tokens_24h: 100,
    popular_mcp_clients: [],
    popular_agents: [],
    popular_regions: [{ label: 'United States', uniq: 5 }],
    avg_agents_per_user: 1.5,
    avg_agents_per_reporting_user: 1.5,
    ...overrides,
  };
}

function fsbSeries(
  overrides: Partial<FSBTelemetrySeries> = {}
): FSBTelemetrySeries {
  const now = new Date().toISOString();
  return {
    generated_at: now,
    aggregate_as_of_day: now.slice(0, 10),
    aggregate_updated_at: now,
    d30: [],
    d90: [],
    d365: [],
    ...overrides,
  };
}

describe('StatsPageComponent visualization lifecycle', () => {
  let github: FakeGitHubStatsService;
  let fsb: FakeFSBTelemetryService;
  let globeStop: jasmine.Spy;
  let globe: jasmine.SpyObj<GlobeVisualizationService>;
  let chartLoader: Deferred<{ default: typeof FakeChart }>;
  let chartInstances: FakeChart[];

  class FakeChart {
    readonly destroy = jasmine.createSpy('chartDestroy');

    constructor(
      readonly canvas: HTMLCanvasElement,
      readonly config: any
    ) {
      chartInstances.push(this);
    }
  }

  beforeEach(async () => {
    github = new FakeGitHubStatsService();
    fsb = new FakeFSBTelemetryService();
    globeStop = jasmine.createSpy('globeStop');
    globe = jasmine.createSpyObj<GlobeVisualizationService>('globe', ['setupGlobe']);
    globe.setupGlobe.and.returnValue(globeStop);
    chartLoader = deferred<{ default: typeof FakeChart }>();
    chartInstances = [];

    await TestBed.configureTestingModule({
      imports: [StatsPageComponent],
      providers: [
        { provide: GitHubStatsService, useValue: github },
        { provide: FSBTelemetryService, useValue: fsb },
        { provide: GlobeVisualizationService, useValue: globe },
        { provide: STATS_CHART_LOADER, useValue: () => chartLoader.promise },
      ],
    })
      .overrideComponent(StatsPageComponent, {
        set: {
          imports: [],
          template: `
            @if (isViewRenderable) {
              <canvas #chartCanvas></canvas>
              <canvas #globeCanvas></canvas>
            }
          `,
        },
      })
      .compileComponents();
  });

  async function createFixture(
    selectedView: AnyViewId = 'stars-cumulative'
  ): Promise<ComponentFixture<StatsPageComponent>> {
    const fixture = TestBed.createComponent(StatsPageComponent);
    fixture.componentInstance.selectedView = selectedView;
    fixture.autoDetectChanges();
    await fixture.whenStable();
    return fixture;
  }

  async function settle(fixture: ComponentFixture<StatsPageComponent>): Promise<void> {
    await Promise.resolve();
    await fixture.whenStable();
  }

  it('renders the initial Stars chart when data arrives before Chart.js', async () => {
    const fixture = await createFixture();

    github.stars$.next(starState());
    await settle(fixture);
    expect(chartInstances).toHaveSize(0);
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();

    chartLoader.resolve({ default: FakeChart });
    await settle(fixture);

    expect(chartInstances).toHaveSize(1);
    expect(chartInstances[0].canvas).toBe(fixture.nativeElement.querySelector('canvas'));
    expect(chartInstances[0].config.type).toBe('line');
  });

  it('renders the initial Stars chart when Chart.js loads before data', async () => {
    const fixture = await createFixture();

    chartLoader.resolve({ default: FakeChart });
    await settle(fixture);
    expect(chartInstances).toHaveSize(0);
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();

    github.stars$.next(starState());
    await settle(fixture);

    expect(chartInstances).toHaveSize(1);
    expect(chartInstances[0].canvas).toBe(fixture.nativeElement.querySelector('canvas'));
  });

  it('mounts a chart for a usable snapshot outside the freshness SLA', async () => {
    const fixture = await createFixture();
    chartLoader.resolve({ default: FakeChart });
    await settle(fixture);

    github.stars$.next(starState(Date.now() - 16 * 60 * 1000));
    await settle(fixture);

    expect(fixture.componentInstance.viewState.kind).toBe('partial');
    expect(chartInstances).toHaveSize(1);
    expect(chartInstances[0].canvas).toBe(fixture.nativeElement.querySelector('canvas'));
  });

  it('coalesces a compound Active now update into one post-render redraw', async () => {
    const fixture = await createFixture('fsb-active-now');
    const redraw = spyOn<any>(fixture.componentInstance, 'redrawChart').and.callThrough();

    // One headline event updates both sources used by Active now. Both update
    // paths request a redraw, but only the final post-render callback may run.
    fsb.headline$.next(readyState(fsbHeadline()));
    await settle(fixture);

    expect(redraw).toHaveBeenCalledTimes(1);
    expect(globe.setupGlobe).toHaveBeenCalledTimes(1);
  });

  it('mounts the initial Active now globe without waiting for Chart.js', async () => {
    const fixture = await createFixture('fsb-active-now');

    fsb.headline$.next(readyState(fsbHeadline()));
    await settle(fixture);

    expect(chartInstances).toHaveSize(0);
    expect(globe.setupGlobe).toHaveBeenCalledTimes(1);
    expect(globe.setupGlobe.calls.mostRecent().args[0]).toBe(
      fixture.nativeElement.querySelectorAll('canvas')[1]
    );
  });

  it('does not mount a chart when the loader resolves after destruction', async () => {
    const fixture = await createFixture();
    github.stars$.next(starState());
    await settle(fixture);

    fixture.destroy();
    chartLoader.resolve({ default: FakeChart });
    await chartLoader.promise;
    await Promise.resolve();

    expect(chartInstances).toHaveSize(0);
    expect(github.stop).toHaveBeenCalledTimes(1);
    expect(fsb.stop).toHaveBeenCalledTimes(1);
  });
});

describe('StatsPageComponent freshness and quality', () => {
  let github: FakeGitHubStatsService;
  let fsb: FakeFSBTelemetryService;

  class RenderedChart {
    destroy(): void {}
  }

  beforeEach(async () => {
    github = new FakeGitHubStatsService();
    fsb = new FakeFSBTelemetryService();
    const globe = jasmine.createSpyObj<GlobeVisualizationService>('globe', ['setupGlobe']);
    globe.setupGlobe.and.returnValue(() => undefined);

    await TestBed.configureTestingModule({
      imports: [StatsPageComponent],
      providers: [
        provideRouter([]),
        { provide: GitHubStatsService, useValue: github },
        { provide: FSBTelemetryService, useValue: fsb },
        { provide: GlobeVisualizationService, useValue: globe },
        {
          provide: STATS_CHART_LOADER,
          useValue: () => Promise.resolve({ default: RenderedChart }),
        },
      ],
    }).compileComponents();
  });

  async function createFixture(
    selectedView: AnyViewId = 'stars-cumulative'
  ): Promise<ComponentFixture<StatsPageComponent>> {
    const fixture = TestBed.createComponent(StatsPageComponent);
    fixture.componentInstance.selectedView = selectedView;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  async function render(fixture: ComponentFixture<StatsPageComponent>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(fixture: ComponentFixture<StatsPageComponent>, selector: string): string {
    return String(fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('shows Live with a separate notice for incomplete star dates', async () => {
    const fixture = await createFixture();

    github.stars$.next(starState(Date.now(), '200', false));
    await render(fixture);

    expect(text(fixture, '.stats-live-badge')).toBe('Live');
    expect(
      fixture.nativeElement.querySelector('.stats-live-badge').getAttribute('title')
    ).toMatch(/Latest snapshot from .+; last checked .+/);
    expect(
      fixture.nativeElement.querySelector('.stats-live-badge').getAttribute('aria-label')
    ).toMatch(/^Live\. Latest snapshot from .+; last checked .+/);
    expect(text(fixture, '.quality-notice')).toBe(
      'The latest star total is available. Exact dates are unavailable for some star changes.'
    );
  });

  it('shows Live with a neutral retry notice after a failed fresh GitHub check', async () => {
    const fixture = await createFixture();

    github.stars$.next(starState(Date.now() - 5 * 60 * 1000, '403'));
    await render(fixture);

    expect(text(fixture, '.stats-live-badge')).toBe('Live');
    expect(fixture.nativeElement.querySelector('.retry-notice')).not.toBeNull();
    expect(text(fixture, '.retry-notice')).toContain('This snapshot is still current');
  });

  it('does not call a future-skewed failed snapshot current', async () => {
    const fixture = await createFixture();

    github.stars$.next(starState(Date.now() + 6 * 60 * 1000, '403'));
    await render(fixture);

    expect(text(fixture, '.stats-live-badge')).toBe('Partial');
    expect(fixture.nativeElement.querySelector('.retry-notice')).toBeNull();
  });

  it('maps an old usable snapshot to Partial and a snapshot over 24 hours to Unavailable', async () => {
    const fixture = await createFixture();

    github.stars$.next(starState(Date.now() - 16 * 60 * 1000));
    await render(fixture);
    expect(text(fixture, '.stats-live-badge')).toBe('Partial');
    expect(text(fixture, '.freshness-notice')).toContain(
      'a fresh update is temporarily unavailable'
    );

    github.stars$.next(starState(Date.now() - 24 * 60 * 60 * 1000 - 1));
    await render(fixture);
    expect(text(fixture, '.stats-live-badge')).toBe('Unavailable');
  });

  it('shows Live and coverage quality for Active now with 0 of 32 reporters', async () => {
    const fixture = await createFixture('fsb-active-now');
    fsb.headline$.next(readyState(fsbHeadline({
      active_users_now: 32,
      active_agents_now: 0,
      active_agents_reporting_users_now: 0,
      active_agents_coverage: 0,
      avg_agents_per_reporting_user: 0,
      aggregate_updated_at: null,
      popular_regions: [],
    })));
    await render(fixture);

    expect(text(fixture, '.stats-live-badge')).toBe('Live');
    expect(text(fixture, '.quality-notice')).toContain(
      'Agent totals include 0 of 32 active users in this snapshot that reported an agent count.'
    );
    expect(text(fixture, '.quality-notice:nth-of-type(2)')).toContain(
      'regional aggregate is not available'
    );
    const metricValues = Array.from(
      fixture.nativeElement.querySelectorAll('.stats-tab-metrics strong')
    ).map((node) => (node as HTMLElement).textContent?.trim());
    expect(metricValues).toEqual(['—', '—']);
  });

  it('hides expired aggregate pills while a fresh Active snapshot remains Live', async () => {
    const fixture = await createFixture('fsb-active-now');
    fsb.headline$.next(readyState(fsbHeadline({
      aggregate_updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString(),
    })));
    await render(fixture);

    expect(text(fixture, '.stats-live-badge')).toBe('Live');
    expect(fixture.componentInstance.hasFsbAggregateSnapshot).toBeFalse();
    expect(text(fixture, '.stats-headline')).toContain('active right now');
    expect(text(fixture, '.stats-headline')).not.toContain('users (365d)');
    expect(text(fixture, '.stats-headline')).not.toContain('agent-days since active v2');
    expect(text(fixture, '.stats-headline')).not.toContain('tokens (24h)');
  });

  it('does not let a delayed regional aggregate downgrade Active now', async () => {
    const fixture = await createFixture('fsb-active-now');
    fsb.headline$.next(readyState(fsbHeadline({
      aggregate_updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    })));
    await render(fixture);

    expect(text(fixture, '.stats-live-badge')).toBe('Live');
    expect(text(fixture, '.quality-notice')).toContain(
      'The regional breakdown is older than two hours.'
    );
  });

  it('shows Active now as Partial when the request timestamp is missing', async () => {
    const fixture = await createFixture('fsb-active-now');
    fsb.headline$.next(readyState(
      fsbHeadline({ generated_at: 'not-a-date' }),
      availability(null)
    ));
    await render(fixture);

    expect(text(fixture, '.stats-live-badge')).toBe('Partial');
    expect(
      fixture.nativeElement.querySelector('.stats-live-badge').getAttribute('aria-label')
    ).toContain('Partial. Latest snapshot update time unavailable');
  });

  it('keeps Tokens loading until independently ordered required responses arrive', async () => {
    const fixture = await createFixture('fsb-tokens');

    fsb.series$.next(readyState(fsbSeries()));
    await render(fixture);
    expect(text(fixture, '.stats-live-badge')).toBe('Loading');

    fsb.headline$.next(readyState(fsbHeadline()));
    await render(fixture);
    expect(text(fixture, '.stats-live-badge')).toBe('Live');
  });

  it('shows commit history quality without downgrading a fresh snapshot', async () => {
    const fixture = await createFixture('commits-cumulative');
    github.commits$.next(readyState(commits(false)));
    await render(fixture);

    expect(text(fixture, '.stats-live-badge')).toBe('Live');
    expect(text(fixture, '.quality-notice')).toBe(
      'Commit history is incomplete, so totals and the chart may omit older commits.'
    );
  });
});
