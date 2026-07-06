import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, LOCALE_ID, OnDestroy, OnInit, PLATFORM_ID, Renderer2, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';

type CountdownUnit = 'days' | 'hours' | 'minutes' | 'seconds';
type CountdownParts = Record<CountdownUnit, string>;

const ROUTE_PATH = '/prometheus';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = 'FSB Full Self-Browsing logo';
const SITE_NAME = 'FSB - Full Self-Browsing';
const TARGET_TIME = new Date('2026-07-31T23:59:59').getTime();
const TOKEN_BASE = 257960;
const TOKEN_ORIGIN = new Date('2026-06-24T12:00:00').getTime();
const TOKENS_PER_MS = 1000000 / 3600000;

@Component({
  selector: 'app-prometheus-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './prometheus-page.component.html',
  styleUrl: './prometheus-page.component.scss',
})
export class PrometheusPageComponent implements OnInit, OnDestroy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);

  days = '--';
  hours = '--';
  minutes = '--';
  seconds = '--';
  tokens = TOKEN_BASE;
  meterOpen = false;
  glitches: Record<CountdownUnit, boolean> = {
    days: false,
    hours: false,
    minutes: false,
    seconds: false,
  };

  private countdownTimer?: number;
  private tokenRaf?: number;
  private glitchTimers: Partial<Record<CountdownUnit, number>> = {};

  get tokensFormatted(): string {
    return this.tokens.toLocaleString('en-US');
  }

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const t = $localize`:@@prometheus.meta.title:Prometheus - Autonomous Browser`;
    const d = $localize`:@@prometheus.meta.description:Prometheus is the autonomous browser build behind FSB: native control spine, stdio MCP bridge, multi-agent tab ownership, runtime sidebar, and DOM-native supervision.`;
    this.applyMeta(t, d, url);
    this.updateCountdown(false);
    this.tokens = this.tokenValue();

    if (this.browser) {
      this.countdownTimer = window.setInterval(() => this.updateCountdown(true), 1000);
    }
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      window.clearInterval(this.countdownTimer);
    }
    if (this.tokenRaf !== undefined && this.browser) {
      window.cancelAnimationFrame(this.tokenRaf);
    }
    for (const timer of Object.values(this.glitchTimers)) {
      if (timer) clearTimeout(timer);
    }
  }

  openMeter(): void {
    this.meterOpen = true;
    if (!this.browser) return;
    if (this.tokenRaf !== undefined) {
      window.cancelAnimationFrame(this.tokenRaf);
    }
    this.runTokenMeter();
  }

  closeMeter(): void {
    this.meterOpen = false;
    if (this.tokenRaf !== undefined && this.browser) {
      window.cancelAnimationFrame(this.tokenRaf);
      this.tokenRaf = undefined;
    }
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

  private updateCountdown(animate: boolean): void {
    const next = this.computeCountdown();
    for (const unit of Object.keys(next) as CountdownUnit[]) {
      if (this[unit] !== next[unit]) {
        this[unit] = next[unit];
        if (animate) {
          this.flash(unit);
        }
      }
    }
  }

  private computeCountdown(): CountdownParts {
    const diff = Math.max(0, TARGET_TIME - Date.now());
    const totalSeconds = Math.floor(diff / 1000);
    const pad = (value: number): string => String(value).padStart(2, '0');
    return {
      days: pad(Math.floor(totalSeconds / 86400)),
      hours: pad(Math.floor((totalSeconds % 86400) / 3600)),
      minutes: pad(Math.floor((totalSeconds % 3600) / 60)),
      seconds: pad(totalSeconds % 60),
    };
  }

  private flash(unit: CountdownUnit): void {
    if (!this.browser) return;
    this.glitches = { ...this.glitches, [unit]: false };
    window.requestAnimationFrame(() => {
      this.glitches = { ...this.glitches, [unit]: true };
    });
    const currentTimer = this.glitchTimers[unit];
    if (currentTimer) clearTimeout(currentTimer);
    this.glitchTimers[unit] = window.setTimeout(() => {
      this.glitches = { ...this.glitches, [unit]: false };
    }, 360);
  }

  private tokenValue(): number {
    return TOKEN_BASE + Math.floor((Date.now() - TOKEN_ORIGIN) * TOKENS_PER_MS);
  }

  private runTokenMeter(): void {
    if (!this.browser || !this.meterOpen) return;
    this.tokens = this.tokenValue();
    this.tokenRaf = window.requestAnimationFrame(() => this.runTokenMeter());
  }
}
