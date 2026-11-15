import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DepthRailComponent } from './depth-rail.component';

/* The rail's own styles: what a finger on it needs from the browser, and what it
   shows while the finger slides (the depth engine sets .is-active and [data-sliding]). */
describe('DepthRailComponent', () => {
  let fixture: ComponentFixture<DepthRailComponent>;
  let nav: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DepthRailComponent] }).compileComponents();
    fixture = TestBed.createComponent(DepthRailComponent);
    fixture.componentRef.setInput('items', [
      { label: 'Intro', layer: 0 },
      { label: 'Agents', layer: 1 },
    ]);
    fixture.componentRef.setInput('label', 'Sections');
    fixture.detectChanges();
    nav = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.fsb-depth-rail')!;
  });

  const label = (i: number): HTMLElement => nav.querySelectorAll<HTMLElement>('.fsb-depth-lbl')[i];

  it('keeps the browser from scrolling or zooming under a finger on it', () => {
    expect(getComputedStyle(nav).touchAction).toBe('none');
  });

  it('names the entry under a sliding finger, and only that one', () => {
    nav.querySelectorAll('.fsb-depth-go')[1].classList.add('is-active');
    // A phone shows the name at once; a wider window fades it in, which is skipped here.
    label(0).style.transition = 'none';
    label(1).style.transition = 'none';
    expect(getComputedStyle(label(1)).opacity).toBe('0');
    nav.setAttribute('data-sliding', '');
    expect(getComputedStyle(label(1)).opacity).toBe('1');
    expect(getComputedStyle(label(0)).opacity).toBe('0');
  });
});
