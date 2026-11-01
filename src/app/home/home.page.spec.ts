import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../testing/fake-auth';
import { TreeService, type Person } from '../tree/tree.service';

import { HomePage } from './home.page';

describe('HomePage', () => {
  it("shows the user's own card on the canvas", async () => {
    const people = new Map<string, Person>([['u1', { id: 'u1', name: 'Ada Lovelace', birth: '1815-12-10' }]]);
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        fakeAuth({ displayName: 'Ada' }),
        { provide: TreeService, useValue: { people: signal(people), loadRoot: async () => people.get('u1') } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    fixture.detectChanges();

    const card: HTMLElement = fixture.nativeElement.querySelector('.tree-canvas app-person-card');
    expect(card.textContent).toContain('Ada Lovelace');
    expect(card.textContent).toContain('AL');
  });
});
