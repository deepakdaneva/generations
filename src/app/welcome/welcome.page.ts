import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, NavController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline, gitNetworkOutline, imagesOutline, lockClosedOutline, ribbonOutline } from 'ionicons/icons';

import { WELCOME_SEEN } from '../core/guards';

interface Slide {
  icon: string;
  title: string;
  text: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'git-network-outline',
    title: 'Every family has a story',
    text: 'Build your family tree and keep it together, across generations.',
  },
  {
    icon: 'add-circle-outline',
    title: 'Grow it from any card',
    text: 'Add parents, siblings, children and spouses with one tap, in birth order.',
  },
  {
    icon: 'images-outline',
    title: 'Faces and memories',
    text: 'Photos, life dates, places and contact details for every person, one tap away.',
  },
  {
    icon: 'ribbon-outline',
    title: 'In loving memory',
    text: 'Remember those who are gone, with their photos and their story.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Private by default',
    text: 'Only you can read your tree. New accounts are approved by an admin before they join.',
  },
];

const SLIDE_MS = 5000;

/** First-launch introduction in the Android app, shown before sign-in. The website has its home page instead. */
@Component({
  selector: 'app-welcome',
  templateUrl: 'welcome.page.html',
  styleUrls: ['welcome.page.scss'],
  imports: [IonButton, IonContent, IonIcon],
})
export class WelcomePage {
  private readonly nav = inject(NavController);
  protected readonly slides = SLIDES;
  protected readonly slideMs = SLIDE_MS;
  protected readonly index = signal(0);
  protected readonly paused = signal(false);
  protected readonly last = computed(() => this.index() === SLIDES.length - 1);

  constructor() {
    addIcons({ addCircleOutline, gitNetworkOutline, imagesOutline, lockClosedOutline, ribbonOutline });
  }

  next(): void {
    if (!this.last()) this.index.update((i) => i + 1);
  }

  prev(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  finish(to: '/register' | '/login'): void {
    try {
      localStorage.setItem(WELCOME_SEEN, '1');
    } catch {
      // Storage unavailable: the introduction shows again next time.
    }
    void this.nav.navigateRoot(to);
  }
}
