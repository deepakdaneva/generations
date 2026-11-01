import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'generations.theme';
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function storedMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system'; // storage unavailable (e.g. private mode)
  }
}

/** Applies the theme to the page. Exported so main.ts can run it before Angular starts (no flash). */
export function applyTheme(mode: ThemeMode = storedMode()): void {
  const dark = mode === 'dark' || (mode === 'system' && systemDark.matches);
  document.documentElement.classList.toggle('ion-palette-dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

/**
 * Theme preference (System default / Light / Dark), saved per device.
 * "System" follows the operating system, including live changes.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(storedMode());

  constructor() {
    systemDark.addEventListener('change', () => applyTheme(this.mode()));
    applyTheme(this.mode());
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // not persisted; still applied for this session
    }
    applyTheme(mode);
  }
}
