import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import {
  IonApp,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuToggle,
  IonRouterOutlet,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { homeOutline, peopleOutline } from 'ionicons/icons';

import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenu,
    IonMenuToggle,
    IonRouterOutlet,
    IonTitle,
    IonToolbar,
  ],
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  // Created at startup so "System default" follows OS theme changes on every page.
  private readonly theme = inject(ThemeService);
  protected readonly pages = [
    { title: 'Home', url: '/home', icon: 'home-outline' },
    { title: 'Users', url: '/users', icon: 'people-outline' },
  ];

  constructor() {
    addIcons({ homeOutline, peopleOutline });
    const router = inject(Router);
    // Leave protected pages when a session ends (logout in another tab, deactivation).
    // Initial access to protected pages is handled by the route guards.
    let signedIn = false;
    effect(() => {
      const profile = this.auth.profile();
      if (signedIn && !profile) router.navigateByUrl('/login', { replaceUrl: true });
      signedIn = !!profile;
    });

    // Installed app: offer a reload when a new version has been downloaded.
    const updates = inject(SwUpdate);
    const toasts = inject(ToastController);
    if (updates.isEnabled) {
      updates.versionUpdates.subscribe(async (event) => {
        if (event.type !== 'VERSION_READY') return;
        const toast = await toasts.create({
          message: 'A new version of Generations is available.',
          position: 'bottom',
          buttons: [{ text: 'Reload', handler: () => document.location.reload() }],
        });
        await toast.present();
      });
    }
  }
}
