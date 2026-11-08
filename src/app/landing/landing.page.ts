import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  gitNetworkOutline,
  globeOutline,
  imagesOutline,
  logoAndroid,
  logoGithub,
  lockClosedOutline,
  phonePortraitOutline,
  ribbonOutline,
} from 'ionicons/icons';

interface Feature {
  icon: string;
  title: string;
  text: string;
}

/** Public home page of the website, for visitors who are not signed in. */
@Component({
  selector: 'app-landing',
  templateUrl: 'landing.page.html',
  styleUrls: ['landing.page.scss'],
  imports: [RouterLink, IonButton, IonContent, IonIcon],
})
export class LandingPage {
  protected readonly repo = 'https://github.com/deepakdaneva/generations';
  protected readonly year = new Date().getFullYear();

  protected readonly features: Feature[] = [
    {
      icon: 'git-network-outline',
      title: 'A tree you can explore',
      text: 'Drag, pinch and zoom across generations. Lines show who is whose son, daughter, brother or sister.',
    },
    {
      icon: 'add-circle-outline',
      title: 'Grow it from any card',
      text: 'Add parents, siblings, children and spouses right from a card, in birth order, or link someone already in your tree.',
    },
    {
      icon: 'images-outline',
      title: 'Every person, their story',
      text: 'Photos, life dates, places, contact details and family, one tap away on each profile.',
    },
    {
      icon: 'ribbon-outline',
      title: 'In loving memory',
      text: 'Remember those who are gone with a ribbon, their photos and an "In loving memory" footer.',
    },
    {
      icon: 'lock-closed-outline',
      title: 'Private by default',
      text: 'Only you can read your family tree. New accounts are approved by an admin before they can join.',
    },
    {
      icon: 'phone-portrait-outline',
      title: 'Install it anywhere',
      text: 'Add it to your home screen on Android, iPhone or desktop. It opens full screen and starts offline.',
    },
  ];

  constructor() {
    addIcons({
      addCircleOutline,
      gitNetworkOutline,
      globeOutline,
      imagesOutline,
      logoAndroid,
      logoGithub,
      lockClosedOutline,
      phonePortraitOutline,
      ribbonOutline,
    });
  }
}
