import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonInput,
  IonInputPasswordToggle,
  IonSpinner,
  IonText,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { gitNetworkOutline } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';

import { authErrorMessage } from './auth-errors';
import { GoogleButtonComponent } from './google-button.component';

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  imports: [
    ReactiveFormsModule,
    GoogleButtonComponent,
    RouterLink,
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonIcon,
    IonInput,
    IonInputPasswordToggle,
    IonSpinner,
    IonText,
  ],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);

  protected readonly busy = signal(false);
  protected readonly inactive = this.auth.signOutReason;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  constructor() {
    addIcons({ gitNetworkOutline });
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return this.form.markAllAsTouched();
    const { email, password } = this.form.getRawValue();
    this.busy.set(true);
    try {
      if (await this.auth.login(email, password)) {
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      } else {
        await this.offerResend(email, password);
      }
    } catch (e) {
      // Password policy tightened since this password was set (force upgrade).
      if ((e as { code?: string }).code === 'auth/password-does-not-meet-requirements') {
        await this.toast(
          "Your password no longer meets our security rules. Use 'Forgot password?' to set a new one.",
          'warning',
        );
      } else {
        await this.toast(authErrorMessage(e), 'danger');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async forgotPassword(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Reset password',
      message: "Enter your email and we'll send you a link to set a new password.",
      inputs: [{ name: 'email', type: 'email', placeholder: 'Email', value: this.form.value.email }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Send link',
          handler: ({ email }) => {
            this.auth
              .sendOwnResetLink(String(email).trim())
              .catch(() => true) // never reveal whether an account exists
              .then((sent) =>
                this.toast(
                  sent
                    ? 'If an account exists for that email, a reset link is on its way.'
                    : "You've already requested 2 reset links for this email today. Please check your inbox or try again tomorrow.",
                  sent ? 'dark' : 'warning',
                ),
              );
          },
        },
      ],
    });
    await alert.present();
  }

  private async offerResend(email: string, password: string): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Verify your email',
      message: 'Please open the verification link we emailed you, then sign in again.',
      buttons: [
        {
          text: 'Resend email',
          handler: () => {
            this.auth
              .resendVerification(email, password)
              .then(() => this.toast('Verification email sent.'))
              .catch((e) => this.toast(authErrorMessage(e), 'danger'));
          },
        },
        { text: 'OK', role: 'cancel' },
      ],
    });
    await alert.present();
  }

  private async toast(message: string, color = 'dark'): Promise<void> {
    const toast = await this.toasts.create({ message, color, duration: 4000, position: 'top' });
    await toast.present();
  }
}
