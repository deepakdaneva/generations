import { Injectable, inject, signal } from '@angular/core';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { AuthService } from '../core/auth.service';
import { FIRESTORE } from '../core/firebase';

export type Gender = 'male' | 'female' | 'other';

export interface Social {
  label: string;
  value: string;
}

/** Editable details of one person (dates are "YYYY-MM-DD"). */
export interface PersonDetails {
  name: string;
  gender?: Gender;
  birth?: string;
  death?: string;
  anniversary?: string;
  email?: string;
  address?: string;
  socials?: Social[];
}

export interface Person extends PersonDetails {
  id: string;
  parents?: string[];
  children?: string[];
  spouses?: string[];
  siblings?: string[];
}

/** Drops empty optional fields so documents only hold what was entered. */
export function cleanDetails(d: PersonDetails): PersonDetails {
  const out: PersonDetails = { name: d.name.trim() };
  for (const key of ['gender', 'birth', 'death', 'anniversary', 'email', 'address'] as const) {
    const value = d[key]?.trim();
    if (value) (out as unknown as Record<string, string>)[key] = value;
  }
  const socials = d.socials?.filter((s) => s.value.trim()).map((s) => ({ label: s.label, value: s.value.trim() }));
  if (socials?.length) out.socials = socials;
  return out;
}

/**
 * The signed-in user's family tree: trees/{uid}/people/{personId}. The user's
 * own card uses their uid as personId.
 */
@Injectable({ providedIn: 'root' })
export class TreeService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  /** Loaded people by id. */
  readonly people = signal<ReadonlyMap<string, Person>>(new Map());

  private get uid(): string {
    const id = this.auth.profile()?.id;
    if (!id) throw new Error('Not signed in');
    return id;
  }

  private ref(id: string) {
    return doc(this.db, 'trees', this.uid, 'people', id);
  }

  /** Loads the user's own card, creating it from their profile on first use. */
  async loadRoot(): Promise<Person> {
    const id = this.uid;
    const snap = await getDoc(this.ref(id));
    if (snap.exists()) return this.put({ id, ...snap.data() } as Person);
    const profile = this.auth.profile()!;
    const details = cleanDetails({ name: profile.displayName, email: profile.email });
    await setDoc(this.ref(id), { ...details, updatedAt: serverTimestamp() });
    return this.put({ id, ...details });
  }

  /** Replaces a person's details, keeping their relationships. */
  async save(id: string, details: PersonDetails): Promise<void> {
    const old = this.people().get(id);
    if (!old) throw new Error('Unknown person');
    const { parents, children, spouses, siblings } = old;
    const links = Object.fromEntries(
      Object.entries({ parents, children, spouses, siblings }).filter(([, v]) => v?.length),
    );
    const clean = cleanDetails(details);
    await setDoc(this.ref(id), { ...clean, ...links, updatedAt: serverTimestamp() });
    this.put({ id, ...clean, ...links });
  }

  private put(person: Person): Person {
    const next = new Map(this.people());
    next.set(person.id, person);
    this.people.set(next);
    return person;
  }
}
