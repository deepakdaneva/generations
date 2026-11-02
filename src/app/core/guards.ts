import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, map, take } from 'rxjs';

import { AuthService } from './auth.service';

/** Runs `decide` once the signed-in state and profile are known. */
function afterAuth(decide: (auth: AuthService, router: Router) => boolean | ReturnType<Router['createUrlTree']>) {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.ready).pipe(
    filter(Boolean),
    take(1),
    map(() => decide(auth, router)),
  );
}

// Route guards only shape navigation. Data access is enforced by firestore.rules.
export const authGuard: CanActivateFn = () =>
  afterAuth((auth, router) => (auth.profile() ? true : router.createUrlTree(['/login'])));

export const adminGuard: CanActivateFn = () =>
  afterAuth((auth, router) => (auth.isAdmin() ? true : router.createUrlTree([auth.profile() ? '/home' : '/login'])));

export const guestGuard: CanActivateFn = () =>
  afterAuth((auth, router) => (auth.profile() ? router.createUrlTree(['/home']) : true));
