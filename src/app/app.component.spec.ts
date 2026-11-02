import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { AppComponent } from './app.component';
import { fakeAuth } from './testing/fake-auth';

async function render(role: 'admin' | 'user') {
  await TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRouter([]), provideServiceWorker('ngsw-worker.js', { enabled: false }), fakeAuth({ role })],
  }).compileComponents();
  const fixture = TestBed.createComponent(AppComponent);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('ion-menu') as HTMLElement & { disabled: boolean };
}

describe('AppComponent', () => {
  it('enables the navigation menu for admins', async () => {
    expect((await render('admin')).disabled).toBe(false);
  });

  it('disables (hides) the navigation menu for normal users', async () => {
    expect((await render('user')).disabled).toBe(true);
  });
});
