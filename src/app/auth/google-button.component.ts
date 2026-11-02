import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonIcon, IonSpinner, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logoGoogle } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';

import { authErrorMessage } from './auth-errors';

/** "Continue with Google" button shared by the sign-in and registration pages. */
@Component({
  selector: 'app-google-button',
  template: `
    <div class="divider"><span>or</span></div>
    <ion-button expand="block" fill="outline" [disabled]="busy()" (click)="signIn()">
      @if (busy()) {
        <ion-spinner name="crescent"></ion-spinner>
      } @else {
        <ion-icon slot="start" name="logo-google" aria-hidden="true"></ion-icon>
        Continue with Google
      }
    </ion-button>
  `,
  styles: `
    .divider {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0 4px;
      color: var(--ion-color-medium);
      font-size: 0.85em;
    }
    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-top: 1px solid var(--ion-color-light-shade);
    }
  `,
  imports: [IonButton, IonIcon, IonSpinner],
})
export class GoogleButtonComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastController);
  protected readonly busy = signal(false);

  constructor() {
    addIcons({ logoGoogle });
  }

  async signIn(): Promise<void> {
    this.busy.set(true);
    try {
      if (await this.auth.loginWithGoogle()) {
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      }
    } catch (e) {
      const toast = await this.toasts.create({
        message: authErrorMessage(e),
        color: 'danger',
        duration: 4000,
        position: 'top',
      });
      await toast.present();
    } finally {
      this.busy.set(false);
    }
  }
}
