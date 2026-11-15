import { Directive, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, afterNextRender, inject } from '@angular/core';

import { DepthEngine, createDepthEngine } from './depth-engine';
import { DepthTilt, createDepthTilt } from './depth-tilt';

/* Starts the depth engine on the element that holds a page's stage and rail.
   Browser-only (afterNextRender never runs during prerender), outside the zone so
   the frame loop never triggers change detection; only a change of plane comes
   back in, through (depthActive). */
@Directive({
  selector: '[appDepthStage]',
  standalone: true,
})
export class DepthStageDirective implements OnDestroy {
  /** Selector for elements that lean toward the pointer; unset means no tilt. */
  @Input() depthTilt: string | null = null;
  @Output() readonly depthActive = new EventEmitter<number>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private engine?: DepthEngine;
  private tilt?: DepthTilt;

  constructor() {
    afterNextRender(() => {
      const el = this.host.nativeElement;
      this.zone.runOutsideAngular(() => {
        this.engine = createDepthEngine(el, {
          onActive: (index) => this.zone.run(() => this.depthActive.emit(index)),
        });
        // Tilt reaches the nav's buttons too, so it listens on the whole page.
        if (this.depthTilt) this.tilt = createDepthTilt(el.ownerDocument.body, this.depthTilt);
      });
    });
  }

  go(index: number): void {
    this.engine?.go(index);
  }

  refreshRail(): void {
    this.engine?.refreshRail();
  }

  ngOnDestroy(): void {
    this.engine?.destroy();
    this.tilt?.destroy();
    this.engine = undefined;
    this.tilt = undefined;
  }
}
