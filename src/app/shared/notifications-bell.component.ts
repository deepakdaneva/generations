import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonPopover,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { notificationsOutline, personAddOutline } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';
import { NotificationService, type AppNotification } from '../core/notifications.service';

/**
 * Bell with a badge of new notifications; opens the list, and a notification
 * opens its details to act on it (today: approve or reject a new account).
 */
@Component({
  selector: 'app-notifications-bell',
  imports: [
    DatePipe,
    IonBadge,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonNote,
    IonPopover,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-button fill="clear" shape="round" class="bell" (click)="openList($event)" [attr.aria-label]="label()">
      <ion-icon slot="icon-only" name="notifications-outline"></ion-icon>
      @if (notifications.unread(); as count) {
        <ion-badge color="danger" aria-hidden="true">{{ count }}</ion-badge>
      }
    </ion-button>

    <ion-popover #list [isOpen]="listOpen()" [event]="listEvent" (didDismiss)="listOpen.set(false)">
      <ng-template>
        <ion-content>
          <ion-list>
            <ion-list-header><ion-label>Notifications</ion-label></ion-list-header>
            @for (n of notifications.items(); track n.id) {
              <ion-item button detail="false" [class.new]="notifications.isNew(n)" (click)="open(n)">
                <ion-icon slot="start" name="person-add-outline" aria-hidden="true"></ion-icon>
                <ion-label class="ion-text-wrap">
                  <h3>{{ n.displayName }} wants to join</h3>
                  <p>{{ n.email }}</p>
                  <p>{{ statusText(n) }} · {{ n.createdAt?.toDate() | date: 'short' }}</p>
                </ion-label>
                @if (notifications.isNew(n)) {
                  <span slot="end" class="dot" aria-label="New"></span>
                }
              </ion-item>
            } @empty {
              <ion-item lines="none"><ion-label color="medium">No notifications</ion-label></ion-item>
            }
          </ion-list>
        </ion-content>
      </ng-template>
    </ion-popover>

    <ion-modal #details [isOpen]="!!selected()" (didDismiss)="selectedId.set(null)">
      <ng-template>
        <ion-header>
          <ion-toolbar>
            <ion-title>New account</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="selectedId.set(null)">Close</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          @if (selected(); as n) {
            <p>
              <a href="#" class="user-link" (click)="openUser(n, $event)">{{ n.displayName }}</a>
              ({{ n.email }}) signed up on {{ n.createdAt?.toDate() | date: 'medium' }} and can't sign in until an admin
              approves the account.
            </p>
            @if (n.status !== 'pending') {
              <ion-note>
                {{ n.status === 'approved' ? 'Approved' : 'Rejected' }}
                {{ n.actedBy === me() ? 'by you' : 'by another admin' }}
                {{ n.actedAt ? 'on ' + (n.actedAt.toDate() | date: 'medium') : '' }}. Open the user to make further
                changes.
              </ion-note>
            }
            <div class="actions">
              <ion-button color="success" [disabled]="n.status !== 'pending' || busy()" (click)="decide(n, true)">
                Approve
              </ion-button>
              <ion-button
                color="danger"
                fill="outline"
                [disabled]="n.status !== 'pending' || busy()"
                (click)="decide(n, false)"
              >
                Reject
              </ion-button>
            </div>
          }
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: `
    .bell {
      position: relative;
      --padding-start: 4px;
      --padding-end: 4px;
      font-size: 18px;
    }
    ion-badge {
      position: absolute;
      top: 2px;
      right: -2px;
      font-size: 10px;
      min-width: 16px;
      --padding-start: 4px;
      --padding-end: 4px;
    }
    .new {
      --background: rgba(var(--ion-color-primary-rgb), 0.08);
    }
    .new h3 {
      font-weight: 600;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--ion-color-primary);
    }
    .user-link {
      font-weight: 600;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
  `,
})
export class NotificationsBellComponent {
  protected readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  private readonly list = viewChild.required<IonPopover>('list');
  private readonly details = viewChild.required<IonModal>('details');

  protected readonly listOpen = signal(false);
  protected listEvent?: Event;
  protected readonly selectedId = signal<string | null>(null);
  /** The opened notification, kept live (another admin may act on it meanwhile). */
  protected readonly selected = computed(
    () => this.notifications.items().find((n) => n.id === this.selectedId()) ?? null,
  );
  protected readonly busy = signal(false);
  protected readonly me = computed(() => this.auth.profile()?.id);
  protected readonly label = computed(() => {
    const count = this.notifications.unread();
    return count ? `Notifications, ${count} new` : 'Notifications';
  });

  constructor() {
    addIcons({ notificationsOutline, personAddOutline });
  }

  protected openList(event: Event): void {
    this.listEvent = event;
    this.listOpen.set(true);
  }

  protected statusText(n: AppNotification): string {
    return { pending: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected' }[n.status];
  }

  protected async open(n: AppNotification): Promise<void> {
    await this.list().dismiss();
    this.selectedId.set(n.id);
    await this.notifications.markRead(n).catch(() => undefined); // only the highlight depends on it
  }

  protected async openUser(n: AppNotification, event: Event): Promise<void> {
    event.preventDefault();
    // Close it fully first; otherwise the modal stays over the next page.
    await this.details().dismiss();
    await this.router.navigate(['/users'], { queryParams: { user: n.userId } });
  }

  protected async decide(n: AppNotification, approve: boolean): Promise<void> {
    if (!approve && !(await this.confirmReject(n))) return;
    this.busy.set(true);
    try {
      await this.notifications.decide(n, approve);
      await this.toast(approve ? `${n.displayName} can sign in now.` : `${n.displayName}'s account stays inactive.`);
    } catch {
      await this.toast("Couldn't save. Someone may have acted on it already.", 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private async confirmReject(n: AppNotification): Promise<boolean> {
    const alert = await this.alerts.create({
      message: `Reject ${n.displayName}? Their account stays inactive; you can still activate it later on the Users page.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Reject', role: 'destructive' },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'destructive';
  }

  private async toast(message: string, color = 'dark'): Promise<void> {
    const toast = await this.toasts.create({ message, color, duration: 3000, position: 'bottom' });
    await toast.present();
  }
}
