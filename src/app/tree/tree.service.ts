import { Injectable, computed, inject, signal } from '@angular/core';
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type WriteBatch,
} from 'firebase/firestore';

import { AuthService } from '../core/auth.service';
import { AvatarError, toPhotoDataUrl } from '../core/avatar';
import { FIRESTORE } from '../core/firebase';

import {
  addRelative,
  deletePerson,
  linkRelative,
  neighbors,
  reorder,
  unlink,
  type Change,
  type LinkRelation,
  type Relation,
} from './relations';

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
  /** Photo slots (0-4) in display order; each is trees/{uid}/photos/{id}_{slot}. */
  photos?: number[];
}

export const MAX_PHOTOS = 5;
/** People loaded when the canvas opens (the user's own card included). */
export const INITIAL_PEOPLE = 10;

/**
 * Where the user left the canvas: the person nearest the middle of the
 * screen, the chain of ids from the user's own card to them (loaded first on
 * the next visit), the screen middle's offset from their card, and the zoom.
 */
export interface SavedView {
  focus: string;
  path: string[];
  dx: number;
  dy: number;
  z: number;
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
  /** Loaded photos (data URLs) by "{personId}_{slot}". */
  readonly photos = signal<ReadonlyMap<string, string>>(new Map());
  private readonly loadingPhotos = new Set<string>();
  /** Linked ids whose documents do not exist. */
  private readonly missingIds = signal<ReadonlySet<string>>(new Set());
  private readonly loading = new Set<string>();
  /** True once loadAll() has run this session. */
  private complete = false;

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
   * Starts a fresh session: the user's own card (created from their profile
   * on first use) plus the nearest relatives, breadth-first, up to
   * INITIAL_PEOPLE in total. The canvas loads the rest as the user pans
   * towards them (loadMore).
   */
  async load(): Promise<void> {
    this.people.set(new Map());
    this.photos.set(new Map());
    this.missingIds.set(new Set());
    this.complete = false;
    const snap = await getDoc(this.ref(this.uid));
    let me: Person;
    if (snap.exists()) {
      me = fromDoc(snap.id, snap.data());
    } else {
      const profile = this.auth.profile()!;
      me = { id: this.uid, ...cleanDetails({ name: profile.displayName, email: profile.email }) };
      await setDoc(this.ref(me.id), toDoc(me));
    }
    this.merge([me]);

    let level = [me];
    while (level.length && this.people().size < INITIAL_PEOPLE) {
      const next = [...new Set(level.flatMap(neighbors))].filter((id) => !this.people().has(id));
      level = await this.loadMore(next.slice(0, INITIAL_PEOPLE - this.people().size));
    }
  }

  /** Ids linked from loaded people that are not loaded yet (the canvas shows placeholders for them). */
  readonly unloaded = computed(() => {
    const people = this.people();
    const ids = new Set<string>();
    for (const p of people.values()) for (const id of neighbors(p)) if (!people.has(id)) ids.add(id);
    for (const id of this.missingIds()) ids.delete(id);
    return ids;
  });

  /** Loads these people (if not loaded yet) and returns the ones that were found. */
  async loadMore(ids: string[]): Promise<Person[]> {
    const todo = [...new Set(ids)].filter((id) => !this.people().has(id) && !this.loading.has(id));
    if (!todo.length) return [];
    todo.forEach((id) => this.loading.add(id));
    try {
      const found: Person[] = [];
      // Firestore's "in" filter takes up to 30 values.
      for (let i = 0; i < todo.length; i += 30) {
        const chunk = todo.slice(i, i + 30);
        const snap = await getDocs(query(this.peopleCol(), where(documentId(), 'in', chunk)));
        found.push(...snap.docs.map((d) => fromDoc(d.id, d.data())));
      }
      // Links to people that no longer exist (e.g. deleted on another device) stay hidden.
      const foundIds = new Set(found.map((p) => p.id));
      const gone = todo.filter((id) => !foundIds.has(id));
      if (gone.length) this.missingIds.set(new Set([...this.missingIds(), ...gone]));
      this.merge(found);
      return found;
    } finally {
      todo.forEach((id) => this.loading.delete(id));
    }
  }

  /**
   * Loads everyone. Removing a relationship or deleting a person must see the
   * whole tree to know who would be cut off.
   */
  async loadAll(): Promise<void> {
    if (this.complete) return;
    const snap = await getDocs(this.peopleCol());
    this.merge(snap.docs.map((d) => fromDoc(d.id, d.data())));
    this.complete = true;
  }

  /** "Remember last position" (off by default), per account. */
  readonly rememberView = signal(false);

  /** Reads the tree settings; returns the saved position when remembering is on. */
  async loadSettings(): Promise<SavedView | null> {
    const snap = await getDoc(this.settingsRef());
    const data = snap.data();
    this.rememberView.set(data?.['rememberView'] === true);
    return this.rememberView() ? ((data?.['view'] as SavedView | undefined) ?? null) : null;
  }

  /** Turning it off also forgets the saved position. */
  async setRememberView(on: boolean): Promise<void> {
    await setDoc(this.settingsRef(), { rememberView: on, updatedAt: serverTimestamp() });
    this.rememberView.set(on);
  }

  async saveView(view: SavedView): Promise<void> {
    if (!this.rememberView()) return;
    await setDoc(this.settingsRef(), { rememberView: true, view, updatedAt: serverTimestamp() });
  }

  private settingsRef() {
    return doc(this.db, 'trees', this.uid);
  }

  private peopleCol() {
    return collection(this.db, 'trees', this.uid, 'people');
  }

  private merge(people: Person[]): void {
    if (!people.length) return;
    const next = new Map(this.people());
    for (const p of people) next.set(p.id, p);
    this.people.set(next);
  }

  /** Replaces a person's details, keeping their relationships; `position` also moves them in the birth order. */
  async save(id: string, details: PersonDetails, position?: number): Promise<void> {
    if (!this.people().get(id)) throw new Error('Unknown person');
    let change: Change = { write: [], remove: [] };
    if (position !== undefined) {
      await this.loadFamily(id);
      change = reorder(this.people(), id, position);
    }
    const old = change.write.find((p) => p.id === id) ?? this.people().get(id)!;
    const { parents, children, spouses, siblings, photos } = old;
    await this.commit({
      write: [
        ...change.write.filter((p) => p.id !== id),
        { id, ...cleanDetails(details), parents, children, spouses, siblings, photos },
      ],
      remove: [],
    });
  }

  /** Adds a new person as `relation` of `ofId`; returns the new id. */
  async add(
    ofId: string,
    relation: Relation,
    details: PersonDetails,
    opts: { before?: boolean; otherParent?: string; position?: number } = {},
  ): Promise<string> {
    const id = doc(this.peopleCol()).id;
    await this.loadFamily(ofId);
    await this.commit(addRelative(this.people(), ofId, relation, { id, ...cleanDetails(details) }, opts));
    return id;
  }

  /**
   * Loads a person's relatives and their siblings. Adding a relative rewrites
   * them (e.g. a parent's children) and needs the siblings' birth order.
   */
  async loadFamily(id: string): Promise<void> {
    await this.loadMore(neighbors(this.people().get(id)!));
    const parents = this.people().get(id)?.parents ?? [];
    await this.loadMore(parents.flatMap((p) => this.people().get(p)?.children ?? []));
  }

  /** Links `ofId` to someone already in the tree as their parent, sibling or child. */
  async linkRelative(
    ofId: string,
    relation: LinkRelation,
    otherId: string,
    opts: { before?: boolean; otherParent?: string } = {},
  ): Promise<void> {
    await this.loadAll();
    await this.commit(linkRelative(this.people(), ofId, relation, otherId, opts));
  }

  async unlink(a: string, b: string): Promise<void> {
    await this.loadAll();
    await this.commit(unlink(this.people(), this.uid, a, b));
  }

  /** Checks that `id` can be deleted (see deletePerson); throws a RelationError explaining why not. */
  async planDelete(id: string): Promise<Change> {
    await this.loadAll();
    return deletePerson(this.people(), this.uid, id);
  }

  async delete(id: string): Promise<void> {
    await this.commit(await this.planDelete(id));
  }

  /** Loads one photo once; the card shows it when it arrives. */
  async loadPhoto(id: string, slot: number): Promise<void> {
    const key = `${id}_${slot}`;
    if (this.photos().has(key) || this.loadingPhotos.has(key)) return;
    this.loadingPhotos.add(key);
    try {
      const snap = await getDoc(this.photoRef(key));
      if (snap.exists()) this.setPhoto(key, snap.data()['data'] as string);
    } finally {
      this.loadingPhotos.delete(key);
    }
  }

  /** Shrinks the picked image and adds it as the person's last photo. */
  async addPhoto(id: string, file: File): Promise<void> {
    const person = this.people().get(id);
    if (!person) throw new Error('Unknown person');
    const used = person.photos ?? [];
    const slot = [0, 1, 2, 3, 4].find((s) => !used.includes(s));
    if (slot === undefined) throw new AvatarError(`A person can have up to ${MAX_PHOTOS} photos.`);
    const data = await toPhotoDataUrl(file);
    const key = `${id}_${slot}`;
    await this.commit({ write: [{ ...person, photos: [...used, slot] }], remove: [] }, (batch) =>
      batch.set(this.photoRef(key), { data, updatedAt: serverTimestamp() }),
    );
    this.setPhoto(key, data);
  }

  async removePhoto(id: string, slot: number): Promise<void> {
    const person = this.people().get(id);
    if (!person) throw new Error('Unknown person');
    const key = `${id}_${slot}`;
    await this.commit(
      { write: [{ ...person, photos: person.photos?.filter((s) => s !== slot) }], remove: [] },
      (batch) => batch.delete(this.photoRef(key)),
    );
    this.setPhoto(key, null);
  }

  private photoRef(key: string) {
    return doc(this.db, 'trees', this.uid, 'photos', key);
  }

  private setPhoto(key: string, data: string | null): void {
    const next = new Map(this.photos());
    if (data) next.set(key, data);
    else next.delete(key);
    this.photos.set(next);
  }

  /**
   * Writes all changed people at once (all or nothing), plus any `extra`
   * writes, then updates the local copy. Deleted people lose their photos too.
   */
  private async commit(change: Change, extra?: (batch: WriteBatch) => void): Promise<void> {
    const batch = writeBatch(this.db);
    for (const p of change.write) batch.set(this.ref(p.id), toDoc(p));
    for (const id of change.remove) {
      batch.delete(this.ref(id));
      for (const slot of this.people().get(id)?.photos ?? []) batch.delete(this.photoRef(`${id}_${slot}`));
    }
    extra?.(batch);
    await batch.commit();
    const next = new Map(this.people());
    for (const id of change.remove) next.delete(id);
    for (const p of change.write) next.set(p.id, toPerson(p));
    this.people.set(next);
  }
}

function fromDoc(id: string, data: DocumentData): Person {
  const { updatedAt: _, ...rest } = data;
  return { id, ...rest } as Person;
}

/** Firestore document for a person: no id, no empty lists, server timestamp. */
function toDoc(p: Person): Record<string, unknown> {
  const { id: _, ...data } = toPerson(p);
  return { ...data, updatedAt: serverTimestamp() };
}

function toPerson(p: Person): Person {
  const out = { ...p } as Record<string, unknown>;
  for (const key of ['parents', 'children', 'spouses', 'siblings', 'photos'])
    if (!(out[key] as string[] | undefined)?.length) delete out[key];
  return out as unknown as Person;
}
