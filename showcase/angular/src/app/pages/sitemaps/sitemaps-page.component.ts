import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  LOCALE_ID,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  Renderer2,
  ViewChild,
  inject,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';

const ROUTE_PATH = '/sitemaps';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = 'FSB Full Self-Browsing logo';
const SITE_NAME = 'FSB - Full Self-Browsing';

interface LandPoint {
  readonly lon: number;
  readonly phi: number;
}

interface ProbeNode {
  readonly theta: number;
  readonly phi: number;
  readonly len: number;
  readonly phase: number;
  readonly speed: number;
}

interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface PolygonGeometry {
  readonly type: 'Polygon';
  readonly coordinates: number[][][];
}

interface MultiPolygonGeometry {
  readonly type: 'MultiPolygon';
  readonly coordinates: number[][][][];
}

interface GeoJsonFeature {
  readonly geometry?: PolygonGeometry | MultiPolygonGeometry | null;
}

interface LandGeoJson {
  readonly features?: GeoJsonFeature[];
}

@Component({
  selector: 'app-sitemaps-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './sitemaps-page.component.html',
  styleUrl: './sitemaps-page.component.scss',
})
export class SiteMapsPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('globeCanvas') private globeCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);

  private readonly browser = isPlatformBrowser(this.platformId);
  private rafId: number | null = null;
  private resizeHandler?: () => void;
  private coastlineAbort?: AbortController;

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const t = $localize`:@@sitemaps.meta.title:FSB - Site Maps`;
    const d = $localize`:@@sitemaps.meta.description:Community site maps for FSB are under development. Contribute well tested site schemas that can become built-in browser knowledge.`;
    this.applyMeta(t, d, url);
  }

  ngAfterViewInit(): void {
    if (!this.browser) return;
    const canvas = this.globeCanvas?.nativeElement;
    if (!canvas) return;
    this.zone.runOutsideAngular(() => this.setupGlobe(canvas));
  }

  ngOnDestroy(): void {
    if (!this.browser) return;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = undefined;
    }
    this.coastlineAbort?.abort();
    this.coastlineAbort = undefined;
  }

  private applyMeta(t: string, d: string, url: string): void {
    this.meta.removeTag('name="robots"');
    this.title.setTitle(t);
    this.meta.updateTag({ name: 'description', content: d });
    this.meta.updateTag({ property: 'og:title', content: t });
    this.meta.updateTag({ property: 'og:description', content: d });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:image', content: OG_IMAGE });
    this.meta.updateTag({ property: 'og:image:width', content: '1000' });
    this.meta.updateTag({ property: 'og:image:height', content: '1000' });
    this.meta.updateTag({ property: 'og:image:alt', content: OG_IMAGE_ALT });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: t });
    this.meta.updateTag({ name: 'twitter:description', content: d });
    this.meta.updateTag({ name: 'twitter:image', content: OG_IMAGE });
    this.meta.updateTag({ name: 'twitter:image:alt', content: OG_IMAGE_ALT });
    emitLocaleHead(this.renderer, this.doc, this.localeId, ROUTE_PATH);
  }

  private setupGlobe(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let radius = 0;
    let cx = 0;
    let cy = 0;

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      cx = width / 2;
      cy = height / 2;
      radius = Math.min(width, height) * 0.42;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    this.resizeHandler = resize;
    window.addEventListener('resize', resize);

    const parallels = 7;
    const meridians = 12;
    const segments = 60;
    const degreesToRadians = Math.PI / 180;
    const random = this.createSeededRandom(719);
    const rand = (min: number, max: number): number => min + random() * (max - min);
    const regions = [
      { lon: -98, lat: 39, spread: 13, count: rand(10, 16) },
      { lon: -102, lat: 23, spread: 7, count: rand(4, 8) },
      { lon: 10, lat: 50, spread: 12, count: rand(8, 14) },
      { lon: 121, lat: 23.7, spread: 2.5, count: rand(2, 6) },
      { lon: 104, lat: 35, spread: 12, count: rand(8, 14) },
      { lon: 138, lat: 37, spread: 5, count: rand(4, 8) },
    ];
    const nodes: ProbeNode[] = [];

    for (const region of regions) {
      const count = Math.round(region.count);
      for (let i = 0; i < count; i += 1) {
        const lon = region.lon + rand(-region.spread, region.spread);
        const lat = region.lat + rand(-region.spread, region.spread) * 0.8;
        nodes.push({
          theta: lon * degreesToRadians,
          phi: (90 - lat) * degreesToRadians,
          len: rand(0.16, 0.4),
          phase: rand(0, Math.PI * 2),
          speed: rand(0.5, 1.4),
        });
      }
    }

    const project = (theta: number, phi: number, rot: number): ProjectedPoint => {
      const angle = theta + rot;
      const x = -Math.sin(phi) * Math.cos(angle);
      const y = -Math.cos(phi);
      const z = -Math.sin(phi) * Math.sin(angle);
      return { x: cx + x * radius, y: cy + y * radius, z };
    };

    let landDots = this.createRoughLandDots();
    this.loadNaturalEarthDots((dots) => {
      landDots = dots;
    });

    const accent = [255, 107, 53] as const;
    let rotation = 0;
    let previousTime = performance.now();

    const draw = (now: number): void => {
      const dt = Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      rotation += dt * 0.18;
      ctx.clearRect(0, 0, width, height);

      const light = this.doc.documentElement.getAttribute('data-theme') === 'light';
      const lineBase = light ? '15,23,42' : '190,205,235';
      const lift = light ? 1 : 2.1;

      for (let m = 0; m < meridians; m += 1) {
        const theta = (m / meridians) * Math.PI * 2;
        ctx.beginPath();
        for (let s = 0; s <= segments; s += 1) {
          const phi = (s / segments) * Math.PI;
          const p = project(theta, phi, rotation);
          if (s === 0) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
        ctx.strokeStyle = `rgba(${lineBase},${((light ? 0.08 : 0.09) * lift).toFixed(3)})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      for (let pa = 1; pa < parallels; pa += 1) {
        const phi = (pa / parallels) * Math.PI;
        ctx.beginPath();
        for (let s = 0; s <= segments; s += 1) {
          const theta = (s / segments) * Math.PI * 2;
          const p = project(theta, phi, rotation);
          if (s === 0) {
            ctx.moveTo(p.x, p.y);
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
        ctx.strokeStyle = `rgba(${lineBase},${((light ? 0.07 : 0.09) * lift).toFixed(3)})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      const landColor = light ? '51,65,85' : '150,170,205';
      this.drawLandDots(ctx, landDots, project, rotation, landColor, light, false);
      this.drawLandDots(ctx, landDots, project, rotation, landColor, light, true);

      const tsec = now / 1000;
      for (const node of nodes) {
        const base = project(node.theta, node.phi, rotation);
        const pulse = (Math.sin(tsec * node.speed + node.phase) + 1) / 2;
        const reach = 1 + node.len;
        const tip = {
          x: cx + (base.x - cx) * reach,
          y: cy + (base.y - cy) * reach,
        };
        const front = (-base.z + 1) / 2;
        const alpha = (0.12 + front * 0.5) * (0.4 + pulse * 0.6);

        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.strokeStyle = `rgba(${accent.join(',')},${(alpha * 0.7).toFixed(3)})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();

        const dotRadius = 1.3 + pulse * 2.2;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent.join(',')},${alpha.toFixed(3)})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(tip.x, tip.y, dotRadius * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent.join(',')},${(alpha * 0.12).toFixed(3)})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(base.x, base.y, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent.join(',')},${(front * 0.4).toFixed(3)})`;
        ctx.fill();
      }

      this.rafId = window.requestAnimationFrame(draw);
    };

    this.rafId = window.requestAnimationFrame(draw);
  }

  private drawLandDots(
    ctx: CanvasRenderingContext2D,
    landDots: readonly LandPoint[],
    project: (theta: number, phi: number, rot: number) => ProjectedPoint,
    rotation: number,
    landColor: string,
    light: boolean,
    frontHemisphere: boolean
  ): void {
    const dotRadius = 0.85;
    ctx.fillStyle = `rgba(${landColor},${frontHemisphere ? (light ? 0.34 : 0.42) : (light ? 0.13 : 0.16)})`;
    ctx.beginPath();
    for (const dot of landDots) {
      const p = project(dot.lon, dot.phi, rotation);
      // This projection treats negative z as the front face, matching the probe-node front factor.
      if (frontHemisphere ? p.z >= -0.02 : p.z < -0.02) continue;
      ctx.moveTo(p.x + dotRadius, p.y);
      ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  private createRoughLandDots(): LandPoint[] {
    const landDots: LandPoint[] = [];
    for (let lat = -82; lat <= 82; lat += 4) {
      for (let lon = -180; lon < 180; lon += 4) {
        if (this.landAt(lon, lat)) {
          landDots.push({
            lon: lon * Math.PI / 180,
            phi: (90 - lat) * Math.PI / 180,
          });
        }
      }
    }
    return landDots;
  }

  private landAt(lon: number, lat: number): boolean {
    const inBox = (l0: number, l1: number, b0: number, b1: number): boolean =>
      lon >= l0 && lon <= l1 && lat >= b0 && lat <= b1;

    if (inBox(-125, -66, 30, 50)) return true;
    if (inBox(-140, -55, 50, 71) && lat < 70) return true;
    if (inBox(-118, -86, 15, 32)) return true;
    if (inBox(-92, -78, 8, 18)) return true;
    if (inBox(-168, -140, 55, 71)) return true;
    if (inBox(-52, -22, 60, 82)) return true;

    if (lon >= -81 && lon <= -34 && lat <= 12 && lat >= -55) {
      if (lat < -20) {
        return lon <= -40 - (lat + 20) * 0.6 && lon >= (lat < -30 ? -76 : -81);
      }
      return true;
    }

    if (inBox(-10, 40, 36, 60)) return true;
    if (inBox(5, 42, 60, 71)) return true;

    if (lon >= -17 && lon <= 51 && lat <= 37 && lat >= -35) {
      if (lat > 12) return lon <= 51;
      return lon <= 42 - Math.max(0, -lat) * 0.3;
    }

    if (inBox(40, 145, 8, 75) && lat < 75 && (lat > 55 || lon < 100 || lat > 20)) return true;
    if (inBox(60, 90, 8, 30)) return true;
    if (inBox(95, 140, -10, 28)) return true;
    if (inBox(100, 155, 25, 60)) return true;
    if (inBox(113, 153, -39, -11)) return true;

    return false;
  }

  private loadNaturalEarthDots(update: (dots: LandPoint[]) => void): void {
    this.coastlineAbort = new AbortController();
    const pushPoint = (out: LandPoint[], lon: number, lat: number): void => {
      out.push({
        lon: lon * Math.PI / 180,
        phi: (90 - lat) * Math.PI / 180,
      });
    };
    const densifyRing = (ring: number[][], out: LandPoint[]): void => {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const a = ring[i];
        const b = ring[i + 1];
        const dLon = b[0] - a[0];
        const dLat = b[1] - a[1];
        const steps = Math.max(1, Math.ceil(Math.hypot(dLon, dLat) / 1.6));
        for (let s = 0; s < steps; s += 1) {
          pushPoint(out, a[0] + dLon * (s / steps), a[1] + dLat * (s / steps));
        }
      }
    };

    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson', {
      signal: this.coastlineAbort.signal,
    })
      .then((response) => response.ok ? response.json() as Promise<LandGeoJson> : Promise.reject())
      .then((geoJson) => {
        const dots: LandPoint[] = [];
        for (const feature of geoJson.features ?? []) {
          const geometry = feature.geometry;
          if (!geometry) continue;
          const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
          for (const polygon of polygons) {
            for (const ring of polygon) {
              densifyRing(ring, dots);
            }
          }
        }
        if (dots.length > 200) {
          update(dots);
        }
      })
      .catch(() => undefined);
  }

  private createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
}
