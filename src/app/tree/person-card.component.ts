import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  createOutline,
  heartOutline,
  linkOutline,
  locationOutline,
  maleFemaleOutline,
  mailOutline,
} from 'ionicons/icons';

import type { Person } from './tree.service';

/** One person on the canvas. */
@Component({
  selector: 'app-person-card',
  imports: [DatePipe, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon],
  template: `
    <ion-card class="person">
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
      <div class="photo" aria-hidden="true">{{ initials() }}</div>
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
    </ion-card>
  `,
  styles: `
    :host {
      display: block;
      width: 260px;
    }
    .person {
      position: relative;
      margin: 0;
      cursor: default;
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
    .person:hover {
      transform: perspective(800px) rotateX(3deg) translateY(-3px);
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.12),
        0 10px 20px rgba(0, 0, 0, 0.12),
        0 28px 48px rgba(0, 0, 0, 0.16);
    }
    @media (prefers-reduced-motion: reduce) {
      .person,
      .person:hover {
        transition: none;
        transform: none;
      }
    }
    .edit {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 1;
    }
    .photo {
      display: grid;
      place-items: center;
      width: 120px;
      height: 120px;
      margin: 20px auto 0;
      border-radius: 50%;
      background: var(--ion-color-step-150, #e0e0e0);
      color: var(--ion-color-step-600, #666);
      font-size: 40px;
      font-weight: 600;
    }
    ion-card-header {
      padding-bottom: 4px;
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
      overflow-wrap: anywhere;
    }
    .facts ion-icon {
      flex: none;
    }
  `,
})
export class PersonCardComponent {
  readonly person = input.required<Person>();
  readonly edit = output<void>();

  protected readonly genders = { male: 'Male', female: 'Female', other: 'Other' };
  protected readonly initials = computed(() =>
    this.person()
      .name.split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join(''),
  );

  constructor() {
    addIcons({
      calendarOutline,
      createOutline,
      heartOutline,
      linkOutline,
      locationOutline,
      maleFemaleOutline,
      mailOutline,
    });
  }
}
