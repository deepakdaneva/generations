import { computed, signal, type ValueProvider } from '@angular/core';

import { AuthService, type UserProfile } from '../core/auth.service';

/** Minimal AuthService stand-in for component tests (no Firebase). */
export function fakeAuth(profile: Partial<UserProfile> | null = null): ValueProvider {
  const p = signal(
    profile
      ? ({ id: 'u1', email: 'a@b.test', displayName: 'Ada', role: 'user', active: true, ...profile } as UserProfile)
      : null,
  );
  return {
    provide: AuthService,
    useValue: {
      ready: signal(true),
      profile: p,
      signOutReason: signal(null),
      isAdmin: computed(() => p()?.role === 'admin'),
      logout: async () => p.set(null),
    },
  };
}
