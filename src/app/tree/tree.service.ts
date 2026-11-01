import { Injectable, inject, signal } from '@angular/core';
import { collection, doc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';

import { AuthService } from '../core/auth.service';
import { FIRESTORE } from '../core/firebase';

import { addRelative, deletePerson, unlink, type Change, type Relation } from './relations';

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

  /** The user's own card. */
  get rootId(): string {
    return this.uid;
  }

  /**
   * Loads the whole tree, creating the user's own card from their profile on
   * first use. ponytail: loads everyone; lazy loading around the visible area
   * comes in a later step.
   */
  async load(): Promise<void> {
    const snap = await getDocs(collection(this.db, 'trees', this.uid, 'people'));
    const people = new Map<string, Person>();
    for (const d of snap.docs) {
      const { updatedAt: _, ...data } = d.data();
      people.set(d.id, { id: d.id, ...data } as Person);
    }
    if (!people.has(this.uid)) {
      const profile = this.auth.profile()!;
      const me: Person = { id: this.uid, ...cleanDetails({ name: profile.displayName, email: profile.email }) };
      await setDoc(this.ref(me.id), toDoc(me));
      people.set(me.id, me);
    }
    this.people.set(people);
  }

  /** Replaces a person's details, keeping their relationships. */
  save(id: string, details: PersonDetails): Promise<void> {
    const old = this.people().get(id);
    if (!old) throw new Error('Unknown person');
    const { parents, children, spouses, siblings } = old;
    return this.commit({ write: [{ id, ...cleanDetails(details), parents, children, spouses, siblings }], remove: [] });
  }

  /** Adds a new person as `relation` of `ofId`; returns the new id. */
  async add(
    ofId: string,
    relation: Relation,
    details: PersonDetails,
    opts: { before?: boolean; otherParent?: string } = {},
  ): Promise<string> {
    const id = doc(collection(this.db, 'trees', this.uid, 'people')).id;
    await this.commit(addRelative(this.people(), ofId, relation, { id, ...cleanDetails(details) }, opts));
    return id;
  }

  unlink(a: string, b: string): Promise<void> {
    return this.commit(unlink(this.people(), this.uid, a, b));
  }

  /** What deleting `id` would remove (the person plus anyone only connected through them). */
  planDelete(id: string): Change {
    return deletePerson(this.people(), this.uid, id);
  }

  delete(id: string): Promise<void> {
    return this.commit(this.planDelete(id));
  }

  /** Writes all changed people at once (all or nothing), then updates the local copy. */
  private async commit(change: Change): Promise<void> {
    const batch = writeBatch(this.db);
    for (const p of change.write) batch.set(this.ref(p.id), toDoc(p));
    for (const id of change.remove) batch.delete(this.ref(id));
    await batch.commit();
    const next = new Map(this.people());
    for (const id of change.remove) next.delete(id);
    for (const p of change.write) next.set(p.id, toPerson(p));
    this.people.set(next);
  }
}

/** Firestore document for a person: no id, no empty lists, server timestamp. */
function toDoc(p: Person): Record<string, unknown> {
  const { id: _, ...data } = toPerson(p);
  return { ...data, updatedAt: serverTimestamp() };
}

function toPerson(p: Person): Person {
  const out = { ...p } as Record<string, unknown>;
  for (const key of ['parents', 'children', 'spouses', 'siblings'])
    if (!(out[key] as string[] | undefined)?.length) delete out[key];
  return out as unknown as Person;
}
