import { Component, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonRadio,
  IonRadioGroup,
  IonTitle,
  IonToggle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';

import { ThemeService, type ThemeMode } from '../core/theme';
import { TreeService } from '../tree/tree.service';

/** App settings: theme (this device) and family-tree preferences (this account). */
@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonRadio,
    IonRadioGroup,
    IonTitle,
    IonToggle,
    IonToolbar,
  ],
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  protected readonly tree = inject(TreeService);
  private readonly toasts = inject(ToastController);

  protected readonly themes: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'System default' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  protected readonly ready = signal(false);

  constructor() {
    this.tree.loadSettings().then(
      () => this.ready.set(true),
      () => this.failed(),
    );
  }

  async setRememberView(on: boolean): Promise<void> {
    try {
      await this.tree.setRememberView(on);
    } catch {
      await this.failed();
    }
  }

  private async failed(): Promise<void> {
    const toast = await this.toasts.create({
      message: "Couldn't load or save your settings. Check your connection.",
      color: 'danger',
      duration: 4000,
      position: 'bottom',
    });
    await toast.present();
  }
}
