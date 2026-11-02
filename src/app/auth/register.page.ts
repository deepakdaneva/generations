import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonInput,
  IonInputPasswordToggle,
  IonSpinner,
  IonText,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { gitNetworkOutline, mailOutline } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';

import { authErrorMessage } from './auth-errors';
import { GoogleButtonComponent } from './google-button.component';

@Component({
  selector: 'app-register',
  templateUrl: 'register.page.html',
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
export class RegisterPage {
  private readonly auth = inject(AuthService);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** Email the verification link was sent to, once registration succeeded. */
  protected readonly sentTo = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    addIcons({ gitNetworkOutline, mailOutline });
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return this.form.markAllAsTouched();
    const { displayName, email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    try {
      const problem = await this.auth.passwordProblem(password);
      if (problem) return this.error.set(problem);
      await this.auth.register(displayName.trim(), email, password);
      this.sentTo.set(email);
    } catch (e) {
      this.error.set(authErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
