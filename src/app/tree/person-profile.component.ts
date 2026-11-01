import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  IonAvatar,
  IonButton,
  IonChip,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonSpinner,
  IonText,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  chevronBack,
  chevronForward,
  close,
  createOutline,
  heartOutline,
  linkOutline,
  locationOutline,
  mailOutline,
  maleFemaleOutline,
} from 'ionicons/icons';

import { AuthService } from '../core/auth.service';

import { yearsBetween } from './person-card.component';
import { siblingsOf } from './relations';
import { TreeService, type Person } from './tree.service';

const LABELS = {
  parents: ['Father', 'Mother', 'Parent'],
  spouses: ['Husband', 'Wife', 'Spouse'],
  children: ['Son', 'Daughter', 'Child'],
  siblings: ['Brother', 'Sister', 'Sibling'],
} as const;

/** "Father", "Wife", ... for a relative, by their gender. */
function label(kind: keyof typeof LABELS, p?: Person): string {
  const [m, f, other] = LABELS[kind];
  return p?.gender === 'male' ? m : p?.gender === 'female' ? f : other;
}

/** Up to two initials of a name. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Read-only profile of a person, opened by clicking their card: photos, life
 * dates, family (tap a relative to open theirs) and contact details. Only a
 * close and an edit button, no header.
 */
@Component({
  selector: 'app-person-profile',
  imports: [
    DatePipe,
    IonAvatar,
    IonButton,
    IonChip,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonSpinner,
    IonText,
  ],
  template: `
    <ion-modal [isOpen]="!!person()" (didDismiss)="closed.emit()" class="profile">
      <ng-template>
        <ion-content>
          @if (person(); as p) {
            <div class="hero" [class.male]="p.gender === 'male'" [class.female]="p.gender === 'female'">
              <div class="corner">
                <ion-button fill="clear" shape="round" (click)="edit.emit(p)" [attr.aria-label]="'Edit ' + p.name">
                  <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                </ion-button>
                <ion-button fill="clear" shape="round" (click)="closed.emit()" aria-label="Close">
                  <ion-icon slot="icon-only" name="close"></ion-icon>
                </ion-button>
              </div>
              <div class="photo" [class.deceased]="!!p.death">
                @if (slot() !== undefined) {
                  @if (photoUrl(); as url) {
                    <img [src]="url" [alt]="'Photo ' + (index() + 1) + ' of ' + p.name" />
                  } @else {
                    <ion-spinner name="dots" aria-label="Loading photo"></ion-spinner>
                  }
                } @else if (profilePhoto(); as url) {
                  <img [src]="url" [alt]="'Profile picture of ' + p.name" />
                } @else {
                  <span aria-hidden="true">{{ initials(p.name) }}</span>
                }
                @if (slots().length > 1) {
                  <ion-button class="arrow prev" fill="clear" (click)="step(-1)" aria-label="Previous photo">
                    <ion-icon slot="icon-only" name="chevron-back"></ion-icon>
                  </ion-button>
                  <ion-button class="arrow next" fill="clear" (click)="step(1)" aria-label="Next photo">
                    <ion-icon slot="icon-only" name="chevron-forward"></ion-icon>
                  </ion-button>
                }
              </div>
              @if (slots().length > 1) {
                <div class="dots" aria-hidden="true">
                  @for (s of slots(); track s; let i = $index) {
                    <span [class.on]="i === index()"></span>
                  }
                </div>
              }
              <h1>{{ p.name }}</h1>
              @if (summary()) {
                <ion-text color="medium"
                  ><p>{{ summary() }}</p></ion-text
                >
              }
              @if (p.death) {
                <ion-chip color="dark" [outline]="true">In loving memory</ion-chip>
              }
            </div>

            <ion-list lines="none">
              <ion-list-header><ion-label>Life</ion-label></ion-list-header>
              @if (p.birth) {
                <ion-item>
                  <ion-icon slot="start" name="calendar-outline" aria-hidden="true"></ion-icon>
                  <ion-label>Born {{ p.birth | date: 'longDate' }}</ion-label>
                </ion-item>
              }
              @if (p.death) {
                <ion-item>
                  <ion-icon slot="start" name="calendar-outline" aria-hidden="true"></ion-icon>
                  <ion-label>Died {{ p.death | date: 'longDate' }}</ion-label>
                </ion-item>
              }
              @if (p.gender) {
                <ion-item>
                  <ion-icon slot="start" name="male-female-outline" aria-hidden="true"></ion-icon>
                  <ion-label>{{ genders[p.gender] }}</ion-label>
                </ion-item>
              }
              @if (p.anniversary) {
                <ion-item>
                  <ion-icon slot="start" name="heart-outline" aria-hidden="true"></ion-icon>
                  <ion-label>Married {{ p.anniversary | date: 'longDate' }}</ion-label>
                </ion-item>
              }
            </ion-list>

            @if (family().length) {
              <ion-list lines="none">
                <ion-list-header><ion-label>Family</ion-label></ion-list-header>
                <div class="chips">
                  @for (r of family(); track r.id) {
                    <ion-chip
                      role="button"
                      tabindex="0"
                      (click)="openPerson.emit(r.id)"
                      (keydown.enter)="openPerson.emit(r.id)"
                      [attr.aria-label]="'Open ' + r.name + ', ' + r.label"
                    >
                      <ion-avatar [class.male]="r.gender === 'male'" [class.female]="r.gender === 'female'">
                        <span>{{ initials(r.name) }}</span>
                      </ion-avatar>
                      <ion-label>{{ r.name }} · {{ r.label }}</ion-label>
                    </ion-chip>
                  }
                </div>
              </ion-list>
            }

            @if (p.email || p.address || p.socials?.length) {
              <ion-list lines="none">
                <ion-list-header><ion-label>Contact</ion-label></ion-list-header>
                @if (p.email) {
                  <ion-item [href]="'mailto:' + p.email" detail="false">
                    <ion-icon slot="start" name="mail-outline" aria-hidden="true"></ion-icon>
                    <ion-label>{{ p.email }}</ion-label>
                  </ion-item>
                }
                @if (p.address) {
                  <ion-item>
                    <ion-icon slot="start" name="location-outline" aria-hidden="true"></ion-icon>
                    <ion-label class="ion-text-wrap">{{ p.address }}</ion-label>
                  </ion-item>
                }
                @for (s of p.socials; track $index) {
                  <ion-item [href]="link(s.value)" target="_blank" rel="noopener noreferrer" detail="false">
                    <ion-icon slot="start" name="link-outline" aria-hidden="true"></ion-icon>
                    <ion-label>{{ s.label }}: {{ s.value }}</ion-label>
                  </ion-item>
                }
              </ion-list>
            }
          }
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: `
    .hero {
      position: relative;
      padding: 32px 16px 16px;
      text-align: center;
      background: var(--ion-color-step-50, #f2f2f2);
    }
    .hero.male {
      background: rgba(37, 99, 235, 0.12);
    }
    .hero.female {
      background: rgba(219, 39, 119, 0.12);
    }
    .corner {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
    }
    .photo {
      position: relative;
      display: grid;
      place-items: center;
      width: 160px;
      height: 160px;
      margin: 0 auto;
      border-radius: 50%;
      overflow: hidden;
      background: var(--ion-color-step-150, #e0e0e0);
      color: var(--ion-color-step-600, #666);
      font-size: 48px;
      font-weight: 600;
      box-shadow: 0 0 0 4px var(--ion-background-color, #fff);
    }
    .photo.deceased {
      filter: grayscale(1);
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
      filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
    }
    .prev {
      left: 0;
    }
    .next {
      right: 0;
    }
    .dots {
      display: flex;
      justify-content: center;
      gap: 5px;
      margin-top: 10px;
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
    h1 {
      margin: 12px 0 0;
      font-size: 26px;
    }
    .hero p {
      margin: 4px 0 8px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      padding: 0 12px;
    }
    ion-avatar {
      display: grid;
      place-items: center;
      background: var(--ion-color-step-150, #e0e0e0);
      font-size: 11px;
      font-weight: 600;
    }
    ion-avatar.male {
      background: rgba(37, 99, 235, 0.25);
    }
    ion-avatar.female {
      background: rgba(219, 39, 119, 0.25);
    }
  `,
})
export class PersonProfileComponent {
  readonly person = input<Person | null>(null);
  readonly edit = output<Person>();
  readonly openPerson = output<string>();
  readonly closed = output<void>();

  private readonly tree = inject(TreeService);
  private readonly auth = inject(AuthService);
  /** The user's own profile without tree photos shows their profile picture. */
  protected readonly profilePhoto = computed(() => {
    const profile = this.auth.profile();
    return profile && profile.id === this.person()?.id ? (profile.photo ?? null) : null;
  });
  protected readonly initials = initials;
  protected readonly genders = { male: 'Male', female: 'Female', other: 'Other' };
  protected readonly index = signal(0);
  protected readonly slots = computed(() => this.person()?.photos ?? []);
  protected readonly slot = computed(() => {
    const slots = this.slots();
    return slots.length ? slots[Math.min(this.index(), slots.length - 1)] : undefined;
  });
  protected readonly photoUrl = computed(() => {
    const slot = this.slot();
    return slot === undefined ? null : (this.tree.photos().get(`${this.person()!.id}_${slot}`) ?? null);
  });

  /** "Son of Ram and Sita · 42 years", or "... · 1940–2010, aged 70". */
  protected readonly summary = computed(() => {
    const p = this.person();
    if (!p) return '';
    const people = this.tree.people();
    const parents = (p.parents ?? []).map((id) => people.get(id)?.name).filter(Boolean);
    const of = parents.length ? `${label('children', p)} of ${parents.join(' and ')}` : '';
    const today = new Date().toISOString().slice(0, 10);
    const age = p.death
      ? [p.birth?.slice(0, 4), p.death.slice(0, 4)].filter(Boolean).join('–') +
        (p.birth ? `, aged ${yearsBetween(p.birth, p.death)}` : '')
      : p.birth
        ? `${yearsBetween(p.birth, today)} years`
        : '';
    return [of, age].filter(Boolean).join(' · ');
  });

  /** Relatives, closest first: parents, spouses, children, siblings. */
  protected readonly family = computed(() => {
    const p = this.person();
    if (!p) return [];
    const people = this.tree.people();
    const rel = (kind: keyof typeof LABELS, ids: string[] = []) =>
      ids
        .filter((id) => id !== p.id && people.has(id))
        .map((id) => {
          const r = people.get(id)!;
          return { id, name: r.name, gender: r.gender, label: label(kind, r) };
        });
    return [
      ...rel('parents', p.parents),
      ...rel('spouses', p.spouses),
      ...rel('children', p.children),
      ...rel('siblings', siblingsOf(people, p.id)),
    ];
  });

  constructor() {
    addIcons({
      calendarOutline,
      chevronBack,
      chevronForward,
      close,
      createOutline,
      heartOutline,
      linkOutline,
      locationOutline,
      mailOutline,
      maleFemaleOutline,
    });
    // A new person starts on their first photo; load their family for the chips.
    const personId = computed(() => this.person()?.id);
    effect(() => {
      const id = personId();
      untracked(() => {
        this.index.set(0);
        if (id) void this.tree.loadFamily(id).catch(() => undefined);
      });
    });
    effect(() => {
      const slot = this.slot();
      const p = this.person();
      if (p && slot !== undefined) void this.tree.loadPhoto(p.id, slot);
    });
  }

  protected step(by: number): void {
    const n = this.slots().length;
    this.index.update((i) => (Math.min(i, n - 1) + by + n) % n);
  }

  /** Web links open in a new tab; anything else (handles, phone numbers) is not a link. */
  protected link(value: string): string | undefined {
    return /^https?:\/\//i.test(value) ? value : undefined;
  }
}
