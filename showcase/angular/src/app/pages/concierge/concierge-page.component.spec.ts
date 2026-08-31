import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ConciergePageComponent } from './concierge-page.component';

describe('ConciergePageComponent', () => {
  let fixture: ComponentFixture<ConciergePageComponent> | undefined;

  beforeEach(async () => {
    document.head.querySelector('script[data-ld="concierge-page"]')?.remove();

    await TestBed.configureTestingModule({
      imports: [ConciergePageComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    document.head.querySelector('script[data-ld="concierge-page"]')?.remove();
    document.head.querySelectorAll('link[rel="canonical"], link[rel="alternate"]').forEach((link) => link.remove());
  });

  function createFixture(): ComponentFixture<ConciergePageComponent> {
    fixture = TestBed.createComponent(ConciergePageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('exposes the selected package manager as a pressed button', () => {
    const page = createFixture();
    const buttonNodes = page.nativeElement.querySelectorAll('.con-tab') as NodeListOf<HTMLButtonElement>;
    const buttons = Array.from(buttonNodes);

    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);

    buttons[1].click();
    page.detectChanges();

    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(page.nativeElement.querySelector('.con-cmd code')?.textContent).toContain('npm install');
  });

  it('renders a self-contained quick-start bridge declaration', () => {
    const page = createFixture();
    const code = page.nativeElement.querySelector('.con-codecard pre')?.textContent ?? '';

    expect(code).toContain('createBridge');
    expect(code).toContain('const projectBridge = createBridge');
    expect(code).toContain('jsonSchema');
    expect(code.indexOf('const projectBridge')).toBeLessThan(code.indexOf('bridge: projectBridge'));
  });

  it('removes its route-specific JSON-LD when the page is destroyed', () => {
    const page = createFixture();

    expect(document.head.querySelector('script[data-ld="concierge-page"]')).not.toBeNull();

    page.destroy();
    fixture = undefined;

    expect(document.head.querySelector('script[data-ld="concierge-page"]')).toBeNull();
  });
});
