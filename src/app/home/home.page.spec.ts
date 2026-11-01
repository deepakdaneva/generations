import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { fakeAuth } from '../testing/fake-auth';
import { TreeService, type Person } from '../tree/tree.service';

import { HomePage } from './home.page';

describe('HomePage', () => {
  it('lays out the tree around the own card', async () => {
    const people = new Map<string, Person>([
      ['u1', { id: 'u1', name: 'Ada Lovelace', parents: ['p1'] }],
      ['p1', { id: 'p1', name: 'Lord Byron', children: ['u1'] }],
    ]);
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        fakeAuth({ displayName: 'Ada' }),
        {
          provide: TreeService,
          useValue: {
            people: signal(people),
            photos: signal(new Map()),
            rootId: 'u1',
            load: async () => undefined,
            loadPhoto: async () => undefined,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelectorAll('app-person-card').length).toBe(2);
    });
    expect(el.textContent).toContain('Ada Lovelace');
    expect(el.textContent).toContain('Lord Byron');
    expect(el.querySelectorAll('.lines path').length).toBeGreaterThan(0);
  });
});
