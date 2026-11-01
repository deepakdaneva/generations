import { Component, inject } from '@angular/core';
import { IonContent, IonIcon, IonText } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { gitNetworkOutline } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';
import { TopActionsComponent } from '../shared/top-actions.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, IonIcon, IonText, TopActionsComponent],
})
export class HomePage {
  protected readonly auth = inject(AuthService);

  constructor() {
    addIcons({ gitNetworkOutline });
  }
}
