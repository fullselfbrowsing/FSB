import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface DepthRailItem {
  readonly label: string;
  /** Index of the plane this entry opens. */
  readonly layer: number;
  /** Section inside a scrolling plane ([data-depth-anchor] order). */
  readonly sec?: number;
}

/* The index of planes on the right edge. The depth engine owns its state (which
   entry is current, clicks), so this only renders the buttons. */
@Component({
  selector: 'app-depth-rail',
  standalone: true,
  templateUrl: './depth-rail.component.html',
  styleUrl: './depth-rail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DepthRailComponent {
  @Input({ required: true }) items: readonly DepthRailItem[] = [];
  @Input({ required: true }) label = '';

  /* Bound as an attribute from here: an interpolated i18n aria-label would bind
     the button's (nonexistent) aria-label property instead. */
  goTo(label: string): string {
    return $localize`:@@depth.rail.goTo:Go to ${label}:label:`;
  }
}
