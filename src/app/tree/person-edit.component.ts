import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators, type ValidatorFn } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonListHeader,
  IonLabel,
  IonModal,
  IonRadio,
  IonRadioGroup,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, trashOutline, unlinkOutline } from 'ionicons/icons';

import type { Person, PersonDetails } from './tree.service';

/** What the form returns: the details, plus the birth order for a new child or sibling. */
export type PersonForm = PersonDetails & { order: number };

const MAX_SOCIALS = 10;
export const SOCIAL_LABELS = ['Instagram', 'Facebook', 'X', 'LinkedIn', 'YouTube', 'Website', 'Phone', 'Other'];

const text = (value = '', validators: ValidatorFn[] = []) => new FormControl(value, { nonNullable: true, validators });

const social = (label = 'Instagram', value = '') =>
  new FormGroup({ label: text(label), value: text(value, [Validators.maxLength(200)]) });

/**
 * Modal form for a person's details (also used for new people). Open by
 * setting `person`; emits `save`, `unlink`, `remove` or `dismissed`.
 */
@Component({
  selector: 'app-person-edit',
  imports: [
    ReactiveFormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonList,
    IonListHeader,
    IonLabel,
    IonModal,
    IonRadio,
    IonRadioGroup,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonText,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-modal [isOpen]="!!person()" (didDismiss)="dismissed.emit()">
      <ng-template>
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button (click)="dismissed.emit()">Cancel</ion-button>
            </ion-buttons>
            <ion-title>{{ title() }}</ion-title>
            <ion-buttons slot="end">
              <ion-button strong (click)="submit()" [disabled]="busy()">
                @if (busy()) {
                  <ion-spinner name="crescent"></ion-spinner>
                } @else {
                  Save
                }
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          @if (linkable()) {
            <ion-segment [value]="mode()" (ionChange)="setMode($event.detail.value)">
              <ion-segment-button value="new"><ion-label>New person</ion-label></ion-segment-button>
              <ion-segment-button value="existing"><ion-label>Already in your tree</ion-label></ion-segment-button>
            </ion-segment>
          }
          @if (mode() === 'existing') {
            <ion-searchbar
              placeholder="Search by name"
              [debounce]="150"
              (ionInput)="query.set($event.detail.value ?? '')"
            ></ion-searchbar>
            @if (candidates(); as list) {
              <ion-radio-group [value]="picked()" (ionChange)="pick($event.detail.value)">
                @for (c of filtered(); track c.id) {
                  <ion-item>
                    <ion-radio [value]="c.id" justify="space-between">
                      <ion-label>
                        {{ c.name }}
                        @if (c.hint) {
                          <p>{{ c.hint }}</p>
                        }
                      </ion-label>
                    </ion-radio>
                  </ion-item>
                } @empty {
                  <ion-item lines="none"><ion-label color="medium">No one found</ion-label></ion-item>
                }
              </ion-radio-group>
            } @else {
              <div class="ion-text-center ion-padding"><ion-spinner aria-label="Loading your tree"></ion-spinner></div>
            }
            @if (pickError() || error()) {
              <ion-text color="danger"
                ><p>{{ pickError() || error() }}</p></ion-text
              >
            }
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" class="fields">
              <ion-input
                formControlName="name"
                label="Name"
                labelPlacement="floating"
                fill="outline"
                errorText="Enter a name (up to 100 characters)"
              ></ion-input>
              <div class="row">
                <ion-input
                  formControlName="birth"
                  type="date"
                  label="Date of birth"
                  labelPlacement="stacked"
                  fill="outline"
                ></ion-input>
                <ion-input
                  formControlName="death"
                  type="date"
                  label="Date of death"
                  labelPlacement="stacked"
                  fill="outline"
                ></ion-input>
              </div>
              <div class="row">
                <ion-select
                  formControlName="gender"
                  label="Gender *"
                  labelPlacement="floating"
                  fill="outline"
                  interface="popover"
                  errorText="Choose a gender"
                >
                  <ion-select-option value="female">Female</ion-select-option>
                  <ion-select-option value="male">Male</ion-select-option>
                  <ion-select-option value="other">Other</ion-select-option>
                </ion-select>
                <ion-input
                  formControlName="anniversary"
                  type="date"
                  label="Anniversary"
                  labelPlacement="stacked"
                  fill="outline"
                ></ion-input>
              </div>
              @if (orderSlots() > 1) {
                <ion-select
                  formControlName="order"
                  label="Birth order"
                  labelPlacement="floating"
                  fill="outline"
                  interface="popover"
                  helperText="Siblings are shown eldest to youngest, left to right."
                >
                  @for (slot of slotList(); track slot) {
                    <ion-select-option [value]="slot">{{ ordinalLabel(slot) }}</ion-select-option>
                  }
                </ion-select>
              }
              <ion-input
                formControlName="email"
                type="email"
                label="Email"
                labelPlacement="floating"
                fill="outline"
                errorText="Enter a valid email address"
              ></ion-input>
              <ion-textarea
                formControlName="address"
                label="Place / address"
                labelPlacement="floating"
                fill="outline"
                [autoGrow]="true"
                [counter]="true"
                maxlength="500"
              ></ion-textarea>

              <ion-list formArrayName="socials">
                <ion-list-header><ion-label>Social profiles and links</ion-label></ion-list-header>
                @for (group of socials.controls; track group; let i = $index) {
                  <ion-item lines="none" [formGroupName]="i">
                    <ion-select
                      formControlName="label"
                      aria-label="Type"
                      interface="popover"
                      slot="start"
                      class="social-label"
                    >
                      @for (l of labels; track l) {
                        <ion-select-option [value]="l">{{ l }}</ion-select-option>
                      }
                    </ion-select>
                    <ion-input
                      formControlName="value"
                      aria-label="Handle or link"
                      placeholder="@handle or link"
                    ></ion-input>
                    <ion-button
                      slot="end"
                      fill="clear"
                      color="medium"
                      (click)="socials.removeAt(i)"
                      aria-label="Remove link"
                    >
                      <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                    </ion-button>
                  </ion-item>
                }
              </ion-list>
              @if (socials.length < maxSocials) {
                <ion-button fill="clear" size="small" (click)="socials.push(social())">
                  <ion-icon slot="start" name="add-outline"></ion-icon>Add link
                </ion-button>
              }
              @if (error()) {
                <ion-text color="danger"
                  ><p>{{ error() }}</p></ion-text
                >
              }
              <button type="submit" hidden></button>
            </form>

            @if (relations().length) {
              <ion-list>
                <ion-list-header><ion-label>Relationships</ion-label></ion-list-header>
                @for (r of relations(); track r.id) {
                  <ion-item>
                    <ion-label>
                      {{ r.name }}
                      <p>{{ r.label }}</p>
                    </ion-label>
                    <ion-button
                      slot="end"
                      fill="clear"
                      color="medium"
                      (click)="unlink.emit(r.id)"
                      [disabled]="busy()"
                      [attr.aria-label]="'Remove relationship with ' + r.name"
                    >
                      <ion-icon slot="icon-only" name="unlink-outline"></ion-icon>
                    </ion-button>
                  </ion-item>
                }
              </ion-list>
            }
            @if (canDelete()) {
              <ion-button
                class="ion-margin-top"
                expand="block"
                fill="outline"
                color="danger"
                (click)="remove.emit()"
                [disabled]="busy()"
              >
                <ion-icon slot="start" name="trash-outline"></ion-icon>Delete person
              </ion-button>
            }
          }
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .row {
      display: flex;
      gap: 12px;
    }
    .row > * {
      flex: 1;
    }
    .social-label {
      width: 120px;
    }
  `,
})
export class PersonEditComponent {
  readonly person = input<Person | null>(null);
  readonly title = input('Edit details');
  /** Relationships that can be removed here. */
  readonly relations = input<{ id: string; name: string; label: string }[]>([]);
  readonly canDelete = input(false);
  /** For a new child or sibling: how many birth-order positions to offer (siblings + 1); 0 hides it. */
  readonly orderSlots = input(0);
  /** Preselected birth order (0 = eldest). */
  readonly orderDefault = input(0);
  /** Adding a spouse: also offer someone already in the tree. */
  readonly linkable = input(false);
  /** People who can be picked (null while loading). */
  readonly candidates = input<{ id: string; name: string; hint: string }[] | null>(null);
  /** "Already in your tree" was chosen: the candidates are needed. */
  readonly findExisting = output<void>();
  /** Save with someone already in the tree picked. */
  readonly link = output<string>();
  readonly unlink = output<string>();
  readonly remove = output<void>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly save = output<PersonForm>();
  readonly dismissed = output<void>();

  protected readonly labels = SOCIAL_LABELS;
  protected readonly maxSocials = MAX_SOCIALS;
  protected readonly social = social;
  protected readonly socials = new FormArray<ReturnType<typeof social>>([]);
  protected readonly form = new FormGroup({
    name: text('', [Validators.required, Validators.maxLength(100)]),
    birth: text(),
    death: text(),
    // Required: it decides the card's tint and the relationship labels (son, daughter, ...).
    gender: text('', [Validators.required]),
    anniversary: text(),
    email: text('', [Validators.email, Validators.maxLength(254)]),
    address: text('', [Validators.maxLength(500)]),
    socials: this.socials,
    order: new FormControl(0, { nonNullable: true }),
  });
  protected readonly mode = signal<'new' | 'existing'>('new');
  protected readonly query = signal('');
  protected readonly picked = signal<string | null>(null);
  protected readonly pickError = signal<string | null>(null);
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return (this.candidates() ?? []).filter((c) => c.name.toLowerCase().includes(q));
  });
  protected readonly slotList = computed(() => Array.from({ length: this.orderSlots() }, (_, i) => i));

  /** "1st (eldest)", "2nd", ..., "4th (youngest)". */
  protected ordinalLabel(i: number): string {
    const n = i + 1;
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
    const note = i === 0 ? ' (eldest)' : i === this.orderSlots() - 1 ? ' (youngest)' : '';
    return `${n}${suffix} child${note}`;
  }

  constructor() {
    addIcons({ addOutline, trashOutline, unlinkOutline });
    effect(() => {
      const p = this.person();
      if (!p) return;
      this.mode.set('new');
      this.query.set('');
      this.picked.set(null);
      this.pickError.set(null);
      this.socials.clear();
      for (const s of p.socials ?? []) this.socials.push(social(s.label, s.value));
      this.form.reset({
        name: p.name,
        birth: p.birth ?? '',
        death: p.death ?? '',
        gender: p.gender ?? '',
        anniversary: p.anniversary ?? '',
        email: p.email ?? '',
        address: p.address ?? '',
        order: this.orderDefault(),
      });
    });
  }

  protected setMode(value: unknown): void {
    this.mode.set(value === 'existing' ? 'existing' : 'new');
    if (value === 'existing' && !this.candidates()) this.findExisting.emit();
  }

  protected pick(value: unknown): void {
    this.picked.set(typeof value === 'string' ? value : null);
    this.pickError.set(null);
  }

  protected submit(): void {
    if (this.mode() === 'existing') {
      const id = this.picked();
      if (id) this.link.emit(id);
      else this.pickError.set('Choose a person');
      return;
    }
    if (this.form.invalid || !this.form.value.name?.trim()) {
      this.form.markAllAsTouched();
      return;
    }
    this.save.emit(this.form.getRawValue() as PersonForm);
  }
}
