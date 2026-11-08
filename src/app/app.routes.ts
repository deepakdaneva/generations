import type { Routes } from '@angular/router';

import { adminGuard, authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  {
    // Website home page; signed-in users go straight to their tree.
    path: '',
    pathMatch: 'full',
    title: 'Generations · Every family has a story',
    canActivate: [guestGuard],
    loadComponent: () => import('./landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'privacy',
    title: 'Privacy Policy · Generations',
    data: { doc: 'privacy' },
    loadComponent: () => import('./legal/legal.page').then((m) => m.LegalPage),
  },
  {
    path: 'terms',
    title: 'Terms of Service · Generations',
    data: { doc: 'terms' },
    loadComponent: () => import('./legal/legal.page').then((m) => m.LegalPage),
  },
  {
    path: 'security',
    title: 'Security · Generations',
    data: { doc: 'security' },
    loadComponent: () => import('./legal/legal.page').then((m) => m.LegalPage),
  },
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
    path: 'settings',
    title: 'Settings · Generations',
    canActivate: [authGuard],
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
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
  { path: '**', redirectTo: '' },
];
