import type { Person } from './tree.service';

/**
 * Relationship bookkeeping, as pure functions over the loaded people. Every
 * link is stored on both people:
 * - `parents` / `children`: each side lists the other.
 * - `spouses`: each side lists the other.
 * - `siblings`: only for siblings without known parents (siblings with parents
 *   are simply children of the same parents). Every member of such a group
 *   stores the same ordered list of the whole group, including themselves.
 *
 * The tree must stay connected to the user's own card, so nothing becomes
 * unreachable: unlinking refuses, deleting also removes what would be cut off.
 */
export type People = ReadonlyMap<string, Person>;
export type Relation = 'parent' | 'child' | 'sibling' | 'spouse';
const LINKS = ['parents', 'children', 'spouses', 'siblings'] as const;

/** People to write (complete documents) and ids to delete. */
export interface Change {
  write: Person[];
  remove: string[];
}

export class RelationError extends Error {}

/** Copy-on-write working set over `people`. */
class Draft {
  private readonly changed = new Map<string, Person>();
  constructor(private readonly people: People) {}

  get(id: string): Person {
    let p = this.changed.get(id);
    if (!p) {
      const base = this.people.get(id);
      if (!base) throw new RelationError('Unknown person');
      p = { ...base };
      for (const key of LINKS) if (base[key]) p[key] = [...base[key]!];
      this.changed.set(id, p);
    }
    return p;
  }

  add(person: Person): void {
    this.changed.set(person.id, person);
  }

  /** All people with the changes so far. */
  view(): Map<string, Person> {
    return new Map([...this.people, ...this.changed]);
  }

  result(remove: string[] = []): Change {
    for (const p of this.changed.values()) for (const key of LINKS) if (!p[key]?.length) delete p[key];
    return { write: [...this.changed.values()].filter((p) => !remove.includes(p.id)), remove };
  }
}

const list = (p: Person, key: (typeof LINKS)[number]) => (p[key] ??= []);

/** Inserts `id` next to `anchor` (before or after it), or at the end. */
function insertNear(ids: string[], id: string, anchor: string, before: boolean): void {
  const i = ids.indexOf(anchor);
  if (i < 0) ids.push(id);
  else ids.splice(before ? i : i + 1, 0, id);
}

/** Everyone linked to `id` in any way. */
export function neighbors(p: Person): string[] {
  return LINKS.flatMap((key) => p[key] ?? []).filter((id) => id !== p.id);
}

/** Ids reachable from `rootId` through any links. */
export function reachable(people: People, rootId: string): Set<string> {
  const seen = new Set([rootId]);
  const queue = [rootId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const n of neighbors(people.get(id) ?? { id, name: '' })) {
      if (!seen.has(n) && people.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/**
 * Adds `person` (a new id with details) as `relation` of `ofId`.
 * `before` puts a sibling to the left; `otherParent` is the second parent of a new child.
 */
export function addRelative(
  people: People,
  ofId: string,
  relation: Relation,
  person: Person,
  opts: { before?: boolean; otherParent?: string } = {},
): Change {
  const d = new Draft(people);
  const x = d.get(ofId);
  const p: Person = { ...person };
  d.add(p);

  switch (relation) {
    case 'parent': {
      const parents = list(x, 'parents');
      if (parents.length >= 2) throw new RelationError('Already has two parents.');
      // Siblings without parents get the new parent together.
      const group = parents.length ? [x.id] : (x.siblings ?? [x.id]);
      p.children = [...group];
      for (const id of group) {
        const m = d.get(id);
        list(m, 'parents').push(p.id);
        delete m.siblings;
      }
      // The other parent becomes their spouse.
      if (parents.length === 2) {
        const other = d.get(parents[0]);
        if (!other.spouses?.includes(p.id)) list(other, 'spouses').push(p.id);
        p.spouses = [other.id];
      }
      break;
    }
    case 'child': {
      p.parents = [x.id];
      list(x, 'children').push(p.id);
      if (opts.otherParent) {
        if (!x.spouses?.includes(opts.otherParent)) throw new RelationError('The other parent must be a spouse.');
        p.parents.push(opts.otherParent);
        list(d.get(opts.otherParent), 'children').push(p.id);
      }
      break;
    }
    case 'sibling': {
      if (x.parents?.length) {
        p.parents = [...x.parents];
        for (const id of x.parents) insertNear(list(d.get(id), 'children'), p.id, x.id, !!opts.before);
      } else {
        const group = [...(x.siblings ?? [x.id])];
        insertNear(group, p.id, x.id, !!opts.before);
        for (const id of group) (id === p.id ? p : d.get(id)).siblings = [...group];
      }
      break;
    }
    case 'spouse':
      p.spouses = [x.id];
      list(x, 'spouses').push(p.id);
      break;
  }
  return d.result();
}

/** Removes every link between `a` and `b` from both; if they are in a sibling group, `b` leaves it. */
function cut(d: Draft, a: string, b: string): void {
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    const p = d.get(from);
    for (const key of ['parents', 'children', 'spouses'] as const) p[key] = p[key]?.filter((id) => id !== to);
  }
  const group = d.get(a).siblings;
  if (group?.includes(b)) {
    const rest = group.filter((id) => id !== b);
    for (const id of rest) d.get(id).siblings = rest.length > 1 ? [...rest] : [];
    d.get(b).siblings = [];
  }
}

/** Removes the relationship between `a` and `b`; refuses if it would cut anyone off from `rootId`. */
export function unlink(people: People, rootId: string, a: string, b: string): Change {
  const d = new Draft(people);
  cut(d, a, b);
  const after = d.view();
  const lost = reachable(people, rootId).size - reachable(after, rootId).size;
  if (lost) {
    throw new RelationError(
      `This is the only connection to ${lost === 1 ? '1 person' : `${lost} people`} in your tree. Delete them instead.`,
    );
  }
  return d.result();
}

/**
 * Deletes `id` and everyone only connected through them (shown to the user
 * before confirming). Children left without parents stay together as
 * siblings. The user's own card cannot be deleted.
 */
export function deletePerson(people: People, rootId: string, id: string): Change {
  if (id === rootId) throw new RelationError("You can't delete your own card.");
  const target = people.get(id);
  if (!target) throw new RelationError('Unknown person');
  const d = new Draft(people);
  const orphans = (target.children ?? []).filter((c) => people.get(c)?.parents?.every((p) => p === id));
  for (const n of neighbors(target)) cut(d, n, id);
  if (orphans.length > 1) for (const o of orphans) d.get(o).siblings = [...orphans];

  const after = d.view();
  after.delete(id);
  const keep = reachable(after, rootId);
  // Unreachable people are only linked to each other, so nothing else changes.
  return d.result([...people.keys()].filter((p) => !keep.has(p)));
}

/** Shortest chain of ids from `from` to `to` (both included), or null when not connected. */
export function pathTo(people: People, from: string, to: string): string[] | null {
  const prev = new Map<string, string>([[from, from]]);
  const queue = [from];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (id === to) {
      const path = [to];
      while (path[0] !== from) path.unshift(prev.get(path[0])!);
      return path;
    }
    for (const n of neighbors(people.get(id) ?? { id, name: '' })) {
      if (!prev.has(n) && people.has(n)) {
        prev.set(n, id);
        queue.push(n);
      }
    }
  }
  return null;
}
