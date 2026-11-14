import { ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, ViewChild, afterNextRender, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { APP_VERSION } from '../../core/seo/version';
import { LanguagePickerComponent } from '../language-picker/language-picker.component';

/* The last plane of every depth page: the site index that replaces the footer.
   The groups float a little toward the pointer (--px/--py, read by the
   .fsb-end-float rules); the copy reuses the footer's trans-units. */
@Component({
  selector: 'app-depth-end',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LanguagePickerComponent],
  templateUrl: './depth-end.component.html',
  styleUrl: './depth-end.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DepthEndComponent implements OnDestroy {
  readonly appVersion = APP_VERSION;

  @ViewChild('end', { static: true }) private readonly end?: ElementRef<HTMLElement>;
  private readonly zone = inject(NgZone);
  private detach?: () => void;

  constructor() {
    afterNextRender(() => {
      const el = this.end?.nativeElement;
      const win = el?.ownerDocument.defaultView;
      if (!el || !win) return;
      if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const move = (e: MouseEvent): void => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        el.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        el.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      };
      const leave = (): void => {
        el.style.setProperty('--px', '0');
        el.style.setProperty('--py', '0');
      };
      this.zone.runOutsideAngular(() => {
        el.addEventListener('mousemove', move, { passive: true });
        el.addEventListener('mouseleave', leave, { passive: true });
      });
      this.detach = () => {
        el.removeEventListener('mousemove', move);
        el.removeEventListener('mouseleave', leave);
      };
    });
  }

  ngOnDestroy(): void {
    this.detach?.();
  }
}
