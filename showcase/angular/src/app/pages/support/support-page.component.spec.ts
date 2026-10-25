import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SupportPageComponent } from './support-page.component';

describe('Support FAQ layout', () => {
  let fixture: ComponentFixture<SupportPageComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupportPageComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SupportPageComponent);
    host = fixture.nativeElement;
    host.style.display = 'block';
    host.style.width = '320px';
    fixture.detectChanges();

    // Measure settled layout without waiting for the expansion animation.
    host.querySelectorAll<HTMLElement>('.faq-answer').forEach(element => {
      element.style.transition = 'none';
    });
  });

  afterEach(() => fixture.destroy());

  function answer(id: string): HTMLElement {
    return host.querySelector<HTMLElement>(`#faq-${id}`)!;
  }

  function question(id: string): HTMLButtonElement {
    return host.querySelector<HTMLButtonElement>(`[aria-controls="faq-${id}"]`)!;
  }

  function toggle(id: string): void {
    question(id).click();
    fixture.detectChanges();
  }

  function lengthenAnswer(id: string): void {
    const paragraph = answer(id).querySelector('p')!;
    paragraph.append(document.createTextNode(` ${paragraph.textContent}`.repeat(8)));
  }

  function expectFullyVisible(id: string): number {
    const element = answer(id);
    const bounds = element.getBoundingClientRect();
    expect(bounds.height).toBeGreaterThan(0);
    expect(element.scrollHeight).toBeLessThanOrEqual(element.clientHeight + 1);
    const content = element.querySelector<HTMLElement>('.faq-answer-inner')!;
    expect(content.scrollHeight).toBeLessThanOrEqual(content.clientHeight + 1);
    element.querySelectorAll('a').forEach(link => {
      const linkBounds = link.getBoundingClientRect();
      expect(linkBounds.top).toBeGreaterThanOrEqual(bounds.top - 1);
      expect(linkBounds.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
    });
    return bounds.height;
  }

  it('collapses every answer completely and makes its contents inert', () => {
    host.querySelectorAll<HTMLElement>('.faq-answer').forEach(element => {
      expect(element.getBoundingClientRect().height).toBe(0);
      expect(element.inert).toBeTrue();
    });
  });

  it('shows a long answer and its resource link when opened and reopened', () => {
    lengthenAnswer('mcp');
    toggle('mcp');
    const height = expectFullyVisible('mcp');
    expect(height).toBeGreaterThan(600);
    expect(question('mcp').getAttribute('aria-expanded')).toBe('true');
    expect(answer('mcp').inert).toBeFalse();

    toggle('mcp');
    expect(answer('mcp').getBoundingClientRect().height).toBe(0);
    expect(question('mcp').getAttribute('aria-expanded')).toBe('false');
    expect(answer('mcp').inert).toBeTrue();

    toggle('mcp');
    expect(expectFullyVisible('mcp')).toBeCloseTo(height, 0);
  });

  it('resizes an open answer when its width or content changes', () => {
    host.style.width = '640px';
    toggle('mcp');
    const wideHeight = expectFullyVisible('mcp');

    host.style.width = '320px';
    const narrowHeight = expectFullyVisible('mcp');
    expect(narrowHeight).toBeGreaterThan(wideHeight);

    lengthenAnswer('mcp');
    const longerHeight = expectFullyVisible('mcp');
    expect(longerHeight).toBeGreaterThan(narrowHeight);
    expect(longerHeight).toBeGreaterThan(600);

    host.style.width = '640px';
    expect(expectFullyVisible('mcp')).toBeLessThan(longerHeight);
  });

  it('keeps multiple answers independently expanded', () => {
    toggle('install');
    toggle('mcp');
    expectFullyVisible('install');
    expectFullyVisible('mcp');
    expect(question('install').getAttribute('aria-expanded')).toBe('true');
    expect(question('mcp').getAttribute('aria-expanded')).toBe('true');
    expect(answer('install').inert).toBeFalse();
    expect(answer('mcp').inert).toBeFalse();

    toggle('install');
    expect(answer('install').getBoundingClientRect().height).toBe(0);
    expect(answer('install').inert).toBeTrue();
    expect(question('mcp').getAttribute('aria-expanded')).toBe('true');
    expect(answer('mcp').inert).toBeFalse();
    expectFullyVisible('mcp');
  });

  it('allows focus on a resource link only while its answer is expanded', () => {
    const button = question('mcp');
    const link = answer('mcp').querySelector<HTMLAnchorElement>('a')!;
    button.focus();
    link.focus();
    expect(document.activeElement).toBe(button);

    toggle('mcp');
    link.focus();
    expect(document.activeElement).toBe(link);

    button.focus();
    toggle('mcp');
    link.focus();
    expect(document.activeElement).toBe(button);
  });
});
