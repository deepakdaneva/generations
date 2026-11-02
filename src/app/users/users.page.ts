import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ActionSheetController,
  IonAvatar,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { addIcons } from 'ionicons';
import { add, personCircleOutline } from 'ionicons/icons';

import { authErrorMessage } from '../auth/auth-errors';
import { AuthService, type Role, type UserProfile } from '../core/auth.service';
import { FIRESTORE } from '../core/firebase';
import { NotificationService } from '../core/notifications.service';
import { TopActionsComponent } from '../shared/top-actions.component';

@Component({
  selector: 'app-users',
  templateUrl: 'users.page.html',
  styleUrls: ['users.page.scss'],
  imports: [
    ReactiveFormsModule,
    TopActionsComponent,
    IonAvatar,
    IonBadge,
    IonButton,
    IonButtons,
    IonContent,
    IonFab,
    IonFabButton,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonText,
    IonTitle,
    IonToolbar,
  ],
})
export class UsersPage {
  protected readonly auth = inject(AuthService);
  private readonly db = inject(FIRESTORE);
  private readonly sheets = inject(ActionSheetController);
  private readonly toasts = inject(ToastController);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  /** ?user=<uid> (e.g. from a notification) opens that user's actions. */
  private readonly requested = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly users = signal<UserProfile[] | null>(null);
  protected readonly search = signal('');
  // ponytail: filters the already-loaded list in memory; move to server-side
  // queries/pagination if the user count grows into the thousands.
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const users = this.users();
    if (!users || !term) return users;
    return users.filter((u) =>
      [u.displayName, u.email, u.role, u.active ? 'active' : 'inactive'].some((v) => v.toLowerCase().includes(term)),
    );
  });
  protected readonly createOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly createError = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['user' as Role, Validators.required],
  });

  constructor() {
    addIcons({ add, personCircleOutline });
    const stop = onSnapshot(
      query(collection(this.db, 'users'), orderBy('displayName')),
      (snap) => this.users.set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserProfile)),
      () => this.toast('Could not load users.', 'danger'),
    );
    inject(DestroyRef).onDestroy(stop);
    effect(() => {
      const id = this.requested()?.get('user');
      const user = id && this.users()?.find((u) => u.id === id);
      if (!user) return;
      void this.router.navigate([], { queryParams: {}, replaceUrl: true }); // open it once
      if (user.id !== this.auth.profile()?.id) void this.manage(user);
    });
  }

  async manage(user: UserProfile): Promise<void> {
    const sheet = await this.sheets.create({
      header: user.displayName,
      subHeader: user.email,
      buttons: [
        {
          text: user.role === 'admin' ? 'Change role to User' : 'Change role to Admin',
          handler: () => this.update(user, { role: user.role === 'admin' ? 'user' : 'admin' }),
        },
        {
          text: user.active ? 'Deactivate account' : 'Activate account',
          role: user.active ? 'destructive' : undefined,
          handler: () => this.update(user, { active: !user.active }),
        },
        { text: 'Send password reset email', handler: () => this.sendReset(user) },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async create(): Promise<void> {
    if (this.form.invalid || this.busy()) return this.form.markAllAsTouched();
    const { displayName, email, role } = this.form.getRawValue();
    this.busy.set(true);
    this.createError.set('');
    try {
      await this.auth.createUser(displayName.trim(), email, role);
      this.createOpen.set(false);
      this.form.reset();
      await this.toast(`${email} created. They will get an email to set their password.`);
    } catch (e) {
      this.createError.set(authErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async update(user: UserProfile, changes: Partial<Pick<UserProfile, 'role' | 'active'>>): Promise<void> {
    try {
      // Activating also resolves the user's pending approval request for every admin.
      if (changes.active === true) await this.notifications.activate(user.id);
      else await updateDoc(doc(this.db, 'users', user.id), changes);
      await this.toast(`${user.displayName} updated.`);
    } catch {
      await this.toast('Update failed. You may not have permission.', 'danger');
    }
  }

  private async sendReset(user: UserProfile): Promise<void> {
    try {
      await this.auth.resetPassword(user.email);
      await this.toast(`Password reset email sent to ${user.email}.`);
    } catch (e) {
      await this.toast(authErrorMessage(e), 'danger');
    }
  }

  private async toast(message: string, color = 'dark'): Promise<void> {
    const toast = await this.toasts.create({ message, color, duration: 3000, position: 'bottom' });
    await toast.present();
  }
}
