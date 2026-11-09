import { Component, inject, resource, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';

const REPO = 'https://github.com/deepakdaneva/generations';

const DOCS: Record<string, { title: string; source: string }> = {
  privacy: { title: 'Privacy Policy', source: 'docs/PRIVACY.md' },
  terms: { title: 'Terms of Service', source: 'docs/TERMS.md' },
  security: { title: 'Security', source: 'SECURITY.md' },
};

/**
 * Public policy pages. The markdown in the repository is rendered at build time
 * (scripts/render-legal.mjs), so each build shows the documents of its own
 * branch. Angular sanitizes the HTML before inserting it.
 */
@Component({
  selector: 'app-legal',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ entry.title }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="legal-doc">
        @if (doc.isLoading()) {
          <ion-spinner name="crescent" aria-label="Loading"></ion-spinner>
        } @else if (doc.error()) {
          <p role="alert">
            Could not load this document. Read it on
            <a [href]="githubUrl" target="_blank" rel="noopener">GitHub</a>.
          </p>
        } @else {
          <article [innerHTML]="doc.value()"></article>
        }
      </div>
    </ion-content>
  `,
  styleUrls: ['legal.page.scss'],
  // The styles target HTML inserted with [innerHTML]; they are scoped by .legal-doc.
  encapsulation: ViewEncapsulation.None,
  imports: [IonBackButton, IonButtons, IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar],
})
export class LegalPage {
  private readonly key = inject(ActivatedRoute).snapshot.data['doc'] as string;
  protected readonly entry = DOCS[this.key] ?? DOCS['privacy'];
  protected readonly githubUrl = `${REPO}/blob/main/${this.entry.source}`;

  protected readonly doc = resource({
    loader: async () => {
      const res = await fetch(`/legal/${this.key}.html`);
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
  });
}
