import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../testing/fake-auth';

import { HomePage } from './home.page';

describe('HomePage', () => {
  it('greets the signed-in user above the tree canvas placeholder', async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([]), fakeAuth({ displayName: 'Ada' })],
    }).compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    const canvas: HTMLElement = fixture.nativeElement.querySelector('.tree-canvas');
    expect(canvas.textContent).toContain('Welcome, Ada');
  });
});
