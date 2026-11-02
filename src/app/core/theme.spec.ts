import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme';

describe('ThemeService', () => {
  const html = document.documentElement;
  const isDark = () => html.classList.contains('ion-palette-dark');

  beforeEach(() => localStorage.clear());

  it('defaults to System default (light here, as the test browser reports no dark preference)', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
    expect(isDark()).toBe(false);
  });

  it('applies and remembers Dark and Light', () => {
    const theme = TestBed.inject(ThemeService);

    theme.setMode('dark');
    expect(isDark()).toBe(true);
    expect(html.style.colorScheme).toBe('dark');
    expect(localStorage.getItem('generations.theme')).toBe('dark');

    theme.setMode('light');
    expect(isDark()).toBe(false);
    expect(localStorage.getItem('generations.theme')).toBe('light');
  });
});
