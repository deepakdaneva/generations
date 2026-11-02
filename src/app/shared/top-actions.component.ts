import { Component, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonAvatar,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonPopover,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { informationCircleOutline, logOutOutline, personCircle, settingsOutline } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';

import { NotificationsBellComponent } from './notifications-bell.component';

/**
 * Header-less page chrome: a floating menu button (only shown to admins, via the
 * menu's disabled state), the notifications bell and a profile button. Place it inside <ion-content>;
 * anything projected into it (e.g. a search bar) sits between the two buttons.
 */
@Component({
  selector: 'app-top-actions',
  host: { slot: 'fixed' },
  template: `
    <div class="top-actions">
      <ion-menu-button></ion-menu-button>
      <div class="middle"><ng-content></ng-content></div>
      <app-notifications-bell></app-notifications-bell>
      <ion-button fill="clear" shape="round" (click)="openProfile($event)" aria-label="Profile menu">
        @if (auth.profile()?.photo; as photo) {
          <ion-avatar slot="icon-only" class="profile-button-avatar"><img [src]="photo" alt="" /></ion-avatar>
        } @else {
          <ion-icon slot="icon-only" name="person-circle"></ion-icon>
        }
      </ion-button>
    </div>

    <ion-popover #profilePopover [isOpen]="profileOpen()" [event]="profileEvent" (didDismiss)="profileOpen.set(false)">
      <ng-template>
        <ion-content>
          <ion-list lines="none">
            <ion-item button detail="false" (click)="openProfilePage()" aria-label="Open your profile">
              <ion-avatar slot="start">
                @if (auth.profile()?.photo; as photo) {
                  <img [src]="photo" alt="" />
                } @else {
                  <ion-icon name="person-circle" color="medium" class="menu-avatar-icon"></ion-icon>
                }
              </ion-avatar>
              <ion-label>
                <h2>{{ auth.profile()?.displayName }}</h2>
                <p>{{ auth.profile()?.email }}</p>
              </ion-label>
            </ion-item>
            <ion-item button detail="false" (click)="openSettings()">
              <ion-icon slot="start" name="settings-outline" aria-hidden="true"></ion-icon>
              <ion-label>Settings</ion-label>
            </ion-item>
            <ion-item button detail="false" (click)="logout()">
              <ion-icon slot="start" name="log-out-outline" aria-hidden="true"></ion-icon>
              <ion-label>Logout</ion-label>
            </ion-item>
            <ion-item button detail="false" (click)="openAbout()">
              <ion-icon slot="start" name="information-circle-outline" aria-hidden="true"></ion-icon>
              <ion-label>About</ion-label>
            </ion-item>
          </ion-list>
        </ion-content>
      </ng-template>
    </ion-popover>
  `,
  styles: `
    :host {
      top: 0;
      left: 0;
      right: 0;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: calc(var(--ion-safe-area-top, 0px) + 4px) 4px 4px;
      background: var(--top-actions-background, transparent);
    }
    .profile-button-avatar {
      width: 32px;
      height: 32px;
    }
    .menu-avatar-icon {
      width: 100%;
      height: 100%;
    }
    .middle {
      flex: 1;
      min-width: 0;
    }
    ion-button {
      --padding-start: 4px;
      --padding-end: 4px;
      font-size: 18px;
      margin-left: auto;
    }
  `,
  imports: [
    IonAvatar,
    IonButton,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonPopover,
    NotificationsBellComponent,
  ],
})
export class TopActionsComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly profileOpen = signal(false);
  private readonly profilePopover = viewChild.required<IonPopover>('profilePopover');
  protected profileEvent?: Event;

  constructor() {
    addIcons({ personCircle, logOutOutline, settingsOutline, informationCircleOutline });
  }

  openProfile(event: Event): void {
    this.profileEvent = event;
    this.profileOpen.set(true);
  }

  async openProfilePage(): Promise<void> {
    // Close the popover fully first; otherwise its overlay stays over the new page.
    await this.profilePopover().dismiss();
    await this.router.navigateByUrl('/profile');
  }

  async openAbout(): Promise<void> {
    await this.profilePopover().dismiss();
    await this.router.navigateByUrl('/about');
  }

  async openSettings(): Promise<void> {
    await this.profilePopover().dismiss();
    await this.router.navigateByUrl('/settings');
  }

  async logout(): Promise<void> {
    this.profileOpen.set(false);
    await this.auth.logout();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
