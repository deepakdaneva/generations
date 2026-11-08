import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { Capacitor } from '@capacitor/core';

import { appStartGuard, WELCOME_SEEN } from './guards';

function run() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const result = TestBed.runInInjectionContext(() =>
    appStartGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return result === true ? true : TestBed.inject(Router).serializeUrl(result as never);
}

describe('appStartGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(WELCOME_SEEN);
  });

  it('shows the website home page in a browser', () => {
    expect(run()).toBe(true);
  });

  it('opens the welcome slides on the first launch of the Android app', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    expect(run()).toBe('/welcome');
  });

  it('opens sign-in once the slides were seen', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    localStorage.setItem(WELCOME_SEEN, '1');
    expect(run()).toBe('/login');
  });
});
