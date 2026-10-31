import { Component, inject, signal, type WritableSignal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonAvatar,
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSpinner,
  IonText,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline, personCircle, trashOutline } from 'ionicons/icons';

import { authErrorMessage } from '../auth/auth-errors';
import { AuthService } from '../core/auth.service';
import { AvatarError, toAvatarDataUrl } from '../core/avatar';
import { RESET_LINKS_PER_DAY, resetLinksLeft } from '../core/reset-limit';
import { TopActionsComponent } from '../shared/top-actions.component';

@Component({
  selector: 'app-profile',
  templateUrl: 'profile.page.html',
  styleUrls: ['profile.page.scss'],
  imports: [
    ReactiveFormsModule,
    TopActionsComponent,
    IonAvatar,
    IonButton,
    IonContent,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonSpinner,
    IonText,
  ],
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastController);

  protected readonly name = new FormControl(this.auth.profile()?.displayName ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(100)],
  });
  protected readonly savingName = signal(false);
  protected readonly savingPhoto = signal(false);
  protected readonly sendingReset = signal(false);
  protected readonly hasPassword = this.auth.hasPassword();
  protected readonly perDay = RESET_LINKS_PER_DAY;
  protected readonly resetsLeft = signal(resetLinksLeft(this.auth.profile()?.email ?? ''));

  constructor() {
    addIcons({ cameraOutline, personCircle, trashOutline });
  }

  async saveName(): Promise<void> {
    const displayName = this.name.value.trim();
    if (!displayName || this.name.invalid) return this.name.markAsTouched();
    await this.run(this.savingName, () => this.auth.updateMyProfile({ displayName }), 'Name updated.');
    this.name.markAsPristine();
  }

  async pickPhoto(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file) return;
    await this.run(
      this.savingPhoto,
      async () => this.auth.updateMyProfile({ photo: await toAvatarDataUrl(file) }),
      'Profile picture updated.',
    );
  }

  removePhoto(): Promise<void> {
    return this.run(this.savingPhoto, () => this.auth.updateMyProfile({ photo: null }), 'Profile picture removed.');
  }

  async sendResetLink(): Promise<void> {
    const email = this.auth.profile()?.email ?? '';
    await this.run(this.sendingReset, () => this.auth.sendOwnResetLink(email), `Password reset link sent to ${email}.`);
    this.resetsLeft.set(resetLinksLeft(email));
  }

  /** Runs an action with a busy flag and a success or error toast. */
  private async run(busy: WritableSignal<boolean>, action: () => Promise<unknown>, done: string): Promise<void> {
    busy.set(true);
    try {
      await action();
      await this.toast(done);
    } catch (e) {
      await this.toast(e instanceof AvatarError ? e.message : authErrorMessage(e), 'danger');
    } finally {
      busy.set(false);
    }
  }

  private async toast(message: string, color = 'dark'): Promise<void> {
    const toast = await this.toasts.create({ message, color, duration: 3000, position: 'bottom' });
    await toast.present();
  }
}
