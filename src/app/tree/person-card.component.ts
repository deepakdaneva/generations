import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonIcon,
  IonSpinner,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  calendarOutline,
  chevronBack,
  chevronForward,
  createOutline,
  heart,
  heartOutline,
  linkOutline,
  locationOutline,
  maleFemaleOutline,
  mailOutline,
  trashOutline,
} from 'ionicons/icons';

import { AuthService } from '../core/auth.service';
import { AvatarError } from '../core/avatar';

import { CARD_H, CARD_W } from './layout';
import type { Relation } from './relations';
import { MAX_PHOTOS, TreeService, type Person } from './tree.service';

/** Awareness-style mourning ribbon (Ionicons has none). */
const RIBBON =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" d="M12 3c-2 0-3.5 1.6-3.5 3.6 0 2.4 2 5 6.5 12.4M12 3c2 0 3.5 1.6 3.5 3.6 0 2.4-2 5-6.5 12.4"/></svg>';

/** Whole years between two YYYY-MM-DD dates, or null when one is missing. */
export function yearsBetween(from?: string, to?: string): number | null {
  if (!from || !to) return null;
  const years = Number(to.slice(0, 4)) - Number(from.slice(0, 4));
  return to.slice(5) < from.slice(5) ? years - 1 : years;
}

export interface AddRequest {
  relation: Relation;
  /** Sibling to the left. */
  before?: boolean;
}

/** One person on the canvas, with buttons around it to add relatives. */
@Component({
  selector: 'app-person-card',
  imports: [DatePipe, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonSpinner],
  host: { '[style.width.px]': 'width', '[style.height.px]': 'height' },
  template: `
    <ion-card
      class="person"
      [class.male]="person().gender === 'male'"
      [class.female]="person().gender === 'female'"
      [class.deceased]="!!person().death"
      tabindex="0"
      [attr.aria-label]="'Open profile of ' + person().name"
      (click)="openProfile($event)"
      (keydown.enter)="openProfile($event)"
    >
      @if (person().death) {
        <ion-icon class="ribbon" [src]="ribbon" aria-label="Deceased"></ion-icon>
      }
      <ion-button
        class="edit"
        fill="clear"
        size="small"
        shape="round"
        (click)="edit.emit()"
        [attr.aria-label]="'Edit ' + person().name"
      >
        <ion-icon slot="icon-only" name="create-outline"></ion-icon>
      </ion-button>
      <div class="photo">
        @if (slot() !== undefined) {
          @if (photoUrl(); as url) {
            <img [src]="url" [alt]="'Photo ' + (index() + 1) + ' of ' + person().name" draggable="false" />
          } @else {
            <ion-spinner name="dots" aria-label="Loading photo"></ion-spinner>
          }
        } @else if (profilePhoto(); as url) {
          <img [src]="url" [alt]="'Profile picture of ' + person().name" draggable="false" />
        } @else {
          <span aria-hidden="true">{{ initials() }}</span>
        }
        @if (slots().length > 1) {
          <ion-button class="arrow prev" fill="clear" size="small" (click)="step(-1)" aria-label="Previous photo">
            <ion-icon slot="icon-only" name="chevron-back"></ion-icon>
          </ion-button>
          <ion-button class="arrow next" fill="clear" size="small" (click)="step(1)" aria-label="Next photo">
            <ion-icon slot="icon-only" name="chevron-forward"></ion-icon>
          </ion-button>
        }
        <div class="photo-actions" [class.always]="!slots().length">
          @if (busy()) {
            <ion-spinner name="crescent" aria-label="Saving photo"></ion-spinner>
          } @else {
            @if (slots().length < maxPhotos) {
              <ion-button
                fill="clear"
                size="small"
                (click)="file.click()"
                [attr.aria-label]="'Add photo of ' + person().name"
              >
                <ion-icon slot="start" name="add"></ion-icon>add
              </ion-button>
            }
            @if (slot() !== undefined) {
              <ion-button
                fill="clear"
                size="small"
                color="danger"
                (click)="removePhoto()"
                aria-label="Remove this photo"
              >
                <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
              </ion-button>
            }
          }
        </div>
        <input #file type="file" accept="image/*" hidden (change)="addPhoto(file)" />
      </div>
      @if (slots().length > 1) {
        <div class="dots" aria-hidden="true">
          @for (s of slots(); track s; let i = $index) {
            <span [class.on]="i === index()"></span>
          }
        </div>
      }
      <ion-card-header>
        <ion-card-title>{{ person().name }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ul class="facts">
          @if (person().birth || person().death) {
            <li>
              <ion-icon name="calendar-outline" aria-label="Lived"></ion-icon>
              {{ person().birth ? (person().birth | date: 'mediumDate') : '?' }}
              @if (person().death) {
                – {{ person().death | date: 'mediumDate' }}
              }
            </li>
          }
          @if (person().gender) {
            <li><ion-icon name="male-female-outline" aria-label="Gender"></ion-icon>{{ genders[person().gender!] }}</li>
          }
          @if (person().anniversary) {
            <li>
              <ion-icon name="heart-outline" aria-label="Anniversary"></ion-icon>
              {{ person().anniversary | date: 'mediumDate' }}
            </li>
          }
          @if (person().email) {
            <li><ion-icon name="mail-outline" aria-label="Email"></ion-icon>{{ person().email }}</li>
          }
          @if (person().address) {
            <li><ion-icon name="location-outline" aria-label="Address"></ion-icon>{{ person().address }}</li>
          }
          @for (s of person().socials; track $index) {
            <li><ion-icon name="link-outline" [attr.aria-label]="s.label"></ion-icon>{{ s.label }}: {{ s.value }}</li>
          }
        </ul>
      </ion-card-content>
      @if (person().death) {
        <div class="memorial">
          <ion-icon [src]="ribbon" aria-hidden="true"></ion-icon>
          In loving memory{{ ageAtDeath() === null ? '' : ' · aged ' + ageAtDeath() }}
        </div>
      }
    </ion-card>

    @if (canAddParent()) {
      <ion-button
        class="add top"
        shape="round"
        size="small"
        (click)="add.emit({ relation: 'parent' })"
        [attr.aria-label]="'Add parent of ' + person().name"
      >
        <ion-icon slot="icon-only" name="add"></ion-icon>
      </ion-button>
    }
    <ion-button
      class="add left"
      shape="round"
      size="small"
      (click)="add.emit({ relation: 'sibling', before: true })"
      [attr.aria-label]="'Add sibling left of ' + person().name"
    >
      <ion-icon slot="icon-only" name="add"></ion-icon>
    </ion-button>
    <ion-button
      class="add right"
      shape="round"
      size="small"
      (click)="add.emit({ relation: 'sibling' })"
      [attr.aria-label]="'Add sibling right of ' + person().name"
    >
      <ion-icon slot="icon-only" name="add"></ion-icon>
    </ion-button>
    <ion-button
      class="add bottom"
      shape="round"
      size="small"
      (click)="add.emit({ relation: 'child' })"
      [attr.aria-label]="'Add child of ' + person().name"
    >
      <ion-icon slot="icon-only" name="add"></ion-icon>
    </ion-button>
    @if (canAddSpouse()) {
      <ion-button
        class="add spouse"
        shape="round"
        size="small"
        color="danger"
        (click)="add.emit({ relation: 'spouse' })"
        [attr.aria-label]="'Add spouse of ' + person().name"
      >
        <ion-icon slot="icon-only" name="heart"></ion-icon>
      </ion-button>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      animation: appear 0.3s ease-out; /* smooth swap from the loading placeholder */
    }
    @keyframes appear {
      from {
        opacity: 0;
      }
    }
    .person {
      position: relative;
      height: 100%;
      margin: 0;
      cursor: pointer;
      border-radius: 16px;
      text-align: center;
      /* Layered shadow: a tight contact shadow plus a soft, wide one reads as depth. */
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.12),
        0 6px 12px rgba(0, 0, 0, 0.1),
        0 18px 36px rgba(0, 0, 0, 0.12);
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
    }
    /* A light blue or pink wash over the normal card colour (works in light and dark mode). */
    .person.male {
      --background:
        linear-gradient(rgba(37, 99, 235, 0.1), rgba(37, 99, 235, 0.1)),
        var(--ion-card-background, var(--ion-item-background, var(--ion-background-color, #fff)));
    }
    .person.female {
      --background:
        linear-gradient(rgba(219, 39, 119, 0.1), rgba(219, 39, 119, 0.1)),
        var(--ion-card-background, var(--ion-item-background, var(--ion-background-color, #fff)));
    }
    :host(:hover) .person {
      transform: perspective(800px) rotateX(3deg) translateY(-3px);
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.12),
        0 10px 20px rgba(0, 0, 0, 0.12),
        0 28px 48px rgba(0, 0, 0, 0.16);
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
      .person,
      :host(:hover) .person {
        transition: none;
        transform: none;
      }
    }
    /* Deceased: mourning ribbon, black-and-white photo, dark footer. */
    .ribbon {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 1;
      font-size: 22px;
    }
    .deceased .photo {
      filter: grayscale(1);
      box-shadow: 0 0 0 3px var(--ion-color-medium);
    }
    .memorial {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 6px;
      padding: 8px;
      background: var(--ion-color-dark);
      color: var(--ion-color-dark-contrast);
      font-size: 13px;
    }
    .edit {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 1;
    }
    .photo {
      position: relative;
      display: grid;
      place-items: center;
      width: 132px;
      height: 132px;
      margin: 16px auto 0;
      border-radius: 50%;
      overflow: hidden;
      background: var(--ion-color-step-150, #e0e0e0);
      color: var(--ion-color-step-600, #666);
      font-size: 40px;
      font-weight: 600;
    }
    .photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      margin: 0;
      --color: #fff;
      --padding-start: 2px;
      --padding-end: 2px;
      filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
    }
    .prev {
      left: 2px;
    }
    .next {
      right: 2px;
    }
    /* "+ add" and remove sit along the bottom of the circle; always shown while there is no photo. */
    .photo-actions {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 34px;
      background: rgba(var(--ion-background-color-rgb, 255, 255, 255), 0.85);
      opacity: 0;
      transition: opacity 0.15s;
    }
    .photo-actions ion-button {
      margin: 0;
      font-size: 13px;
      --padding-start: 4px;
      --padding-end: 4px;
    }
    .photo-actions.always,
    :host(:hover) .photo-actions,
    :host(:focus-within) .photo-actions,
    :host(.active) .photo-actions {
      opacity: 1;
    }
    .dots {
      display: flex;
      justify-content: center;
      gap: 5px;
      margin-top: 6px;
    }
    .dots span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ion-color-step-300, #bbb);
    }
    .dots span.on {
      background: var(--ion-color-primary);
    }
    ion-card-header {
      padding-bottom: 4px;
    }
    ion-card-title {
      font-size: 20px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .facts {
      list-style: none;
      margin: 0;
      padding: 0;
      text-align: left;
      font-size: 13px;
    }
    .facts li {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 2px 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .facts ion-icon {
      flex: none;
    }

    /* Add-relative buttons sit on the card's edges; shown on hover, focus or when the card is active (touch). */
    .add {
      position: absolute;
      z-index: 2;
      --padding-start: 6px;
      --padding-end: 6px;
      margin: 0;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
    }
    :host(:hover) .add,
    :host(:focus-within) .add,
    :host(.active) .add {
      opacity: 1;
      pointer-events: auto;
    }
    .top {
      top: -18px;
      left: 50%;
      transform: translateX(-50%);
    }
    .bottom {
      bottom: -18px;
      left: 50%;
      transform: translateX(-50%);
    }
    .left {
      left: -18px;
      top: 50%;
      transform: translateY(-50%);
    }
    .right {
      right: -18px;
      top: 50%;
      transform: translateY(-50%);
    }
    .spouse {
      right: -14px;
      bottom: -14px;
    }
  `,
})
export class PersonCardComponent {
  readonly person = input.required<Person>();
  readonly canAddParent = input(true);
  /** False while married to someone alive (a widow or widower can marry again). */
  readonly canAddSpouse = input(true);
  readonly edit = output<void>();
  /** The card itself was clicked (not one of its buttons): show the profile. */
  readonly view = output<void>();
  readonly add = output<AddRequest>();

  protected readonly width = CARD_W;
  protected readonly height = CARD_H;
  protected readonly genders = { male: 'Male', female: 'Female', other: 'Other' };
  protected readonly ribbon = RIBBON;
  protected readonly ageAtDeath = computed(() => yearsBetween(this.person().birth, this.person().death));
  protected readonly initials = computed(() =>
    this.person()
      .name.split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join(''),
  );

  private readonly tree = inject(TreeService);
  private readonly auth = inject(AuthService);
  /** The user's own card without tree photos shows their profile picture. */
  protected readonly profilePhoto = computed(() => {
    const profile = this.auth.profile();
    return profile?.id === this.person().id ? (profile.photo ?? null) : null;
  });
  private readonly toasts = inject(ToastController);
  protected readonly maxPhotos = MAX_PHOTOS;
  protected readonly busy = signal(false);
  protected readonly index = signal(0);
  protected readonly slots = computed(() => this.person().photos ?? []);
  /** Photo slot shown now; stays in range when photos are removed. */
  protected readonly slot = computed(() => {
    const slots = this.slots();
    return slots.length ? slots[Math.max(0, Math.min(this.index(), slots.length - 1))] : undefined;
  });
  protected readonly photoUrl = computed(() => {
    const slot = this.slot();
    return slot === undefined ? null : (this.tree.photos().get(`${this.person().id}_${slot}`) ?? null);
  });

  constructor() {
    addIcons({
      add,
      calendarOutline,
      chevronBack,
      chevronForward,
      createOutline,
      heart,
      heartOutline,
      linkOutline,
      locationOutline,
      maleFemaleOutline,
      mailOutline,
      trashOutline,
    });
    // Fetch only the photo on screen.
    effect(() => {
      const slot = this.slot();
      if (slot !== undefined) void this.tree.loadPhoto(this.person().id, slot);
    });
  }

  protected openProfile(e: Event): void {
    if ((e.target as Element).closest('ion-button, input')) return;
    this.view.emit();
  }

  protected step(by: number): void {
    const n = this.slots().length;
    this.index.update((i) => (Math.min(i, n - 1) + by + n) % n);
  }

  protected async addPhoto(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file || this.busy()) return; // one save at a time, so two picks never take the same slot
    const id = this.person().id;
    // Show the new photo; the `person` input itself only updates on the next render.
    if (await this.run(() => this.tree.addPhoto(id, file)))
      this.index.set((this.tree.people().get(id)?.photos?.length ?? 1) - 1);
  }

  protected async removePhoto(): Promise<void> {
    const slot = this.slot();
    if (slot !== undefined) await this.run(() => this.tree.removePhoto(this.person().id, slot));
  }

  private async run(action: () => Promise<void>): Promise<boolean> {
    this.busy.set(true);
    try {
      await action();
      return true;
    } catch (e) {
      const message = e instanceof AvatarError ? e.message : "Couldn't save the photo. Check your connection.";
      const toast = await this.toasts.create({ message, color: 'danger', duration: 4000, position: 'bottom' });
      await toast.present();
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
