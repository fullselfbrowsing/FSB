import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  QueryList,
  ViewChild,
  ViewChildren,
  inject,
} from '@angular/core';

type LoaderTheme = 'light' | 'dark';
type DotShape = 'square' | 'rounded' | 'circle';
type LetterPattern = readonly string[];
type DirectionFn = (row: number, col: number) => number;

const GRID_ROWS = 5;
const GRID_COLS = 3;
const DOT_COUNT = GRID_ROWS * GRID_COLS;
const BASE_SIZE = 60;
const REVEAL_MS = 470;
const HOLD_MS = 260;
const EXIT_MS = 240;
const BLANK_MS = 340;
const LETTER_MS = REVEAL_MS + HOLD_MS + EXIT_MS + BLANK_MS;
const FADE = 0.34;

const LETTERS: readonly LetterPattern[] = [
  ['###', '#..', '###', '#..', '#..'],
  ['###', '#..', '###', '..#', '###'],
  ['###', '#.#', '###', '#.#', '###'],
];

const DIRECTIONS: readonly DirectionFn[] = [
  (row) => row / (GRID_ROWS - 1),
  (_row, col) => col / (GRID_COLS - 1),
  (row) => (GRID_ROWS - 1 - row) / (GRID_ROWS - 1),
  (_row, col) => (GRID_COLS - 1 - col) / (GRID_COLS - 1),
  (row, col) => (row / (GRID_ROWS - 1) + col / (GRID_COLS - 1)) / 2,
  (row, col) => (row / (GRID_ROWS - 1) + (GRID_COLS - 1 - col) / (GRID_COLS - 1)) / 2,
  (row, col) => ((GRID_ROWS - 1 - row) / (GRID_ROWS - 1) + (GRID_COLS - 1 - col) / (GRID_COLS - 1)) / 2,
  (row, col) => ((GRID_ROWS - 1 - row) / (GRID_ROWS - 1) + col / (GRID_COLS - 1)) / 2,
];

@Component({
  selector: 'app-pixel-loader',
  standalone: true,
  templateUrl: './pixel-loader.component.html',
  styleUrl: './pixel-loader.component.scss',
})
export class PixelLoaderComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly zone = inject(NgZone);

  @Input() accent = '#FB923C';
  @Input() theme: LoaderTheme = 'light';
  @Input() size = BASE_SIZE;
  @Input() speed = 1;
  @Input() dotShape: DotShape = 'square';

  @ViewChild('root') private root?: ElementRef<HTMLElement>;
  @ViewChildren('dotEl') private dotEls?: QueryList<ElementRef<HTMLElement>>;

  readonly dots = Array.from({ length: DOT_COUNT }, (_, index) => index);

  private rafId?: number;
  private startedAt = 0;
  private viewReady = false;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.applyStaticStyles();
    this.zone.runOutsideAngular(() => this.startAnimation());
  }

  ngOnChanges(): void {
    if (!this.viewReady) return;
    this.applyStaticStyles();
  }

  ngOnDestroy(): void {
    if (this.rafId !== undefined && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.rafId);
    }
  }

  private startAnimation(): void {
    if (typeof window === 'undefined') return;
    this.startedAt = performance.now();

    const tick = (now: number) => {
      this.draw(now);
      this.rafId = window.requestAnimationFrame(tick);
    };

    this.rafId = window.requestAnimationFrame(tick);
  }

  private draw(now: number): void {
    const dots = this.dotEls?.toArray() ?? [];
    if (!dots.length) return;

    const rawElapsed = Math.max(0, now - this.startedAt) * this.normalizedSpeed;
    const elapsed = Number.isFinite(rawElapsed) ? rawElapsed : 0;
    const globalIndex = Math.floor(elapsed / LETTER_MS);
    const letter = LETTERS[globalIndex % LETTERS.length] ?? LETTERS[0];
    const direction = DIRECTIONS[globalIndex % DIRECTIONS.length] ?? DIRECTIONS[0];
    const localTime = elapsed - globalIndex * LETTER_MS;
    const revealProgress = Math.min(localTime / REVEAL_MS, 1);
    const exiting = localTime >= REVEAL_MS + HOLD_MS;
    const exitProgress = exiting ? Math.min((localTime - (REVEAL_MS + HOLD_MS)) / EXIT_MS, 1) : 0;
    const faint = this.theme === 'dark' ? 0.18 : 0.13;

    dots.forEach((dotRef, index) => {
      const row = Math.floor(index / GRID_COLS);
      const col = index % GRID_COLS;
      const isOn = letter[row]?.charAt(col) === '#';
      let amount = 0;

      if (isOn) {
        const offset = direction(row, col);
        amount = this.smoothStep((revealProgress - offset * FADE) / (1 - FADE));
        if (exiting) {
          amount *= 1 - this.smoothStep((exitProgress - offset * FADE) / (1 - FADE));
        }
      }

      this.applyDotFrame(dotRef.nativeElement, faint, amount);
    });
  }

  private applyDotFrame(dot: HTMLElement, faint: number, amount: number): void {
    dot.style.opacity = (faint + (1 - faint) * amount).toFixed(3);
    dot.style.transform = `scale(${(0.82 + 0.18 * amount).toFixed(3)})`;
    dot.style.background = this.accent;
    dot.style.boxShadow =
      amount > 0.04
        ? `0 0 ${(4.5 * amount).toFixed(1)}px ${this.accent}44, 0 0 ${(1.75 * amount).toFixed(1)}px ${this.accent}66`
        : 'none';
  }

  private applyStaticStyles(): void {
    const root = this.root?.nativeElement;
    if (root) {
      root.style.transform = `scale(${this.normalizedSize / BASE_SIZE})`;
    }

    const borderRadius = this.borderRadius;
    this.dotEls?.forEach((dotRef) => {
      const dot = dotRef.nativeElement;
      dot.style.borderRadius = borderRadius;
      dot.style.background = this.accent;
    });
  }

  private smoothStep(value: number): number {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
  }

  private get normalizedSize(): number {
    return Number.isFinite(this.size) && this.size > 0 ? this.size : BASE_SIZE;
  }

  private get normalizedSpeed(): number {
    return Number.isFinite(this.speed) && this.speed > 0 ? this.speed : 1;
  }

  private get borderRadius(): string {
    if (this.dotShape === 'circle') return '50%';
    if (this.dotShape === 'rounded') return '3px';
    return '1px';
  }
}
