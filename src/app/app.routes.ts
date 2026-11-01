import type { Routes } from '@angular/router';

import { adminGuard, authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in · Generations',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'Create account · Generations',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'home',
    title: 'Home · Generations',
    canActivate: [authGuard],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'profile',
    title: 'Profile · Generations',
    canActivate: [authGuard],
    loadComponent: () => import('./profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'users',
    title: 'User Management · Generations',
    canActivate: [adminGuard],
    loadComponent: () => import('./users/users.page').then((m) => m.UsersPage),
  },
  {
    path: 'about',
    title: 'About · Generations',
    loadComponent: () => import('./about/about.page').then((m) => m.AboutPage),
  },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' },
];
