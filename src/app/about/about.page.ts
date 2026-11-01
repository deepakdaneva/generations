import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
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
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { build } from '../core/version';

const REPO = 'https://github.com/deepakdaneva/generations';

/** Public page with the details every app should list: version, source, license, contact. */
@Component({
  selector: 'app-about',
  templateUrl: 'about.page.html',
  styleUrls: ['about.page.scss'],
  imports: [
    DatePipe,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
})
export class AboutPage {
  protected readonly build = build;
  protected readonly repo = REPO;
  protected readonly commitUrl = build.commit ? `${REPO}/commit/${build.commit}` : null;
  protected readonly environment = !build.project
    ? 'Local development'
    : build.project.endsWith('-prod')
      ? 'Production'
      : build.project.endsWith('-uat')
        ? 'UAT (testing)'
        : build.project;
}
