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
 * unreachable: unlinking and deleting refuse what would cut anyone off.
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

/**
 * Inserts `id` at birth-order `position` of the siblings in `order`, placing it
 * in `ids` (a parent's children, which may also hold half-siblings) right
 * before the sibling now at that position, or after the youngest.
 */
function placeAt(ids: string[], id: string, order: string[], position: number): void {
  const next = order[position];
  if (next !== undefined && ids.includes(next)) return void ids.splice(ids.indexOf(next), 0, id);
  const youngest = order.filter((o) => ids.includes(o)).pop();
  if (youngest === undefined) ids.push(id);
  else ids.splice(ids.indexOf(youngest) + 1, 0, id);
}

/**
 * Children of exactly these parents, eldest first (the order of the first
 * parent's `children`). Half-siblings belong to another set of parents.
 */
export function childrenOf(people: People, parents: string[]): string[] {
  const set = new Set(parents);
  return (people.get(parents[0])?.children ?? []).filter((c) => {
    const own = people.get(c)?.parents ?? [];
    return own.length === set.size && own.every((x) => set.has(x));
  });
}

/** The person's full siblings including themselves, eldest first. */
export function siblingsOf(people: People, id: string): string[] {
  const p = people.get(id);
  if (!p) return [id];
  return p.parents?.length ? childrenOf(people, p.parents) : (p.siblings ?? [id]);
}

/**
 * Whether `id` is married to someone alive (no date of death, or not loaded).
 * Only then can no new spouse be added: a widow or widower can marry again.
 */
export function hasLivingSpouse(people: People, id: string): boolean {
  return (people.get(id)?.spouses ?? []).some((s) => !people.get(s)?.death);
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
 * `otherParent` is the second parent of a new child. For children and
 * siblings, `position` is their birth order among their full siblings
 * (0 = eldest; siblings are drawn eldest to youngest, left to right). Without
 * it a child is the youngest and a sibling goes right after `ofId`, or right
 * before when `before` is set.
 */
export function addRelative(
  people: People,
  ofId: string,
  relation: Relation,
  person: Person,
  opts: { before?: boolean; otherParent?: string; position?: number } = {},
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
      if (opts.otherParent && !x.spouses?.includes(opts.otherParent))
        throw new RelationError('The other parent must be a spouse.');
      p.parents = opts.otherParent ? [x.id, opts.otherParent] : [x.id];
      const order = childrenOf(people, p.parents);
      for (const id of p.parents) placeAt(list(d.get(id), 'children'), p.id, order, opts.position ?? order.length);
      break;
    }
    case 'sibling': {
      const order = siblingsOf(people, x.id);
      const position = opts.position ?? order.indexOf(x.id) + (opts.before ? 0 : 1);
      if (x.parents?.length) {
        p.parents = [...x.parents];
        for (const id of x.parents) placeAt(list(d.get(id), 'children'), p.id, order, position);
      } else {
        const group = [...order];
        placeAt(group, p.id, order, position);
        for (const id of group) (id === p.id ? p : d.get(id)).siblings = [...group];
      }
      break;
    }
    case 'spouse':
      if (x.death) throw new RelationError(`${x.name} has died; no new spouse can be added.`);
      if (hasLivingSpouse(people, x.id)) throw new RelationError(`${x.name} is already married.`);
      p.spouses = [x.id];
      list(x, 'spouses').push(p.id);
      break;
  }
  return d.result();
}

/**
 * Generation of everyone connected to `rootId`: 0 for them, -1 for parents,
 * +1 for children, the same for spouses and siblings. The first path found
 * wins if links disagree.
 */
export function generations(people: People, rootId: string): Map<string, number> {
  const gen = new Map([[rootId, 0]]);
  const queue = [rootId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const p = people.get(id);
    const g = gen.get(id)!;
    const next: [string[] | undefined, number][] = [
      [p?.parents, -1],
      [p?.children, 1],
      [p?.spouses, 0],
      [p?.siblings, 0],
    ];
    for (const [ids, step] of next) {
      for (const n of ids ?? []) {
        if (!gen.has(n) && people.has(n)) {
          gen.set(n, g + step);
          queue.push(n);
        }
      }
    }
  }
  return gen;
}

export type LinkRelation = 'parent' | 'sibling' | 'child';

/** Whether `to` is `from` or one of their descendants. */
function descends(people: People, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(people.get(id)?.children ?? []));
  }
  return false;
}

/** Makes `parentId` a parent of `childId`, or of their whole sibling group when they have no parents. */
function linkParent(d: Draft, people: People, childId: string, parentId: string): void {
  const c = d.get(childId);
  const parent = d.get(parentId);
  const group = c.parents?.length ? [childId] : (c.siblings ?? [childId]);
  for (const id of group) {
    const m = d.get(id);
    if (m.parents?.includes(parentId)) throw new RelationError(`${parent.name} is already a parent of ${m.name}.`);
    if ((m.parents?.length ?? 0) >= 2) throw new RelationError(`${m.name} already has two parents.`);
    const spouseParent = m.spouses?.some((sp) => people.get(sp)?.parents?.includes(parentId));
    if (
      descends(people, id, parentId) ||
      m.spouses?.includes(parentId) ||
      siblingsOf(people, id).includes(parentId) ||
      spouseParent
    )
      throw new RelationError(`${parent.name} can't be a parent of ${m.name}.`);
  }
  for (const id of group) {
    const m = d.get(id);
    list(m, 'parents').push(parentId);
    delete m.siblings;
    if (!parent.children?.includes(id)) list(parent, 'children').push(id);
  }
}

/**
 * Makes `a` and `b` siblings. One of them may already belong to a family
 * (parents or a sibling group); the other joins it, next to `a` on the
 * `before` (left) or right side. Two families are never merged.
 */
function linkSibling(d: Draft, people: People, a: string, b: string, before = false): void {
  const [pa, pb] = [d.get(a), d.get(b)];
  if (siblingsOf(people, a).includes(b)) throw new RelationError(`${pb.name} is already a sibling of ${pa.name}.`);
  if ([...(pa.parents ?? []), ...(pa.children ?? []), ...(pa.spouses ?? [])].includes(b))
    throw new RelationError(`${pb.name} is already related to ${pa.name}.`);
  const hasFamily = (p: Person) => !!p.parents?.length || (p.siblings?.length ?? 0) > 1;
  if (hasFamily(pa) && hasFamily(pb))
    throw new RelationError(`${pa.name} and ${pb.name} both have their own families already.`);
  // The one without a family joins the other's, on the requested side of `a`.
  const [into, alone, left] = hasFamily(pb) ? [pb, pa, !before] : [pa, pb, before];
  const order = siblingsOf(people, into.id);
  const position = order.indexOf(into.id) + (left ? 0 : 1);
  if (into.parents?.length) {
    alone.parents = [...into.parents];
    for (const id of into.parents) placeAt(list(d.get(id), 'children'), alone.id, order, position);
  } else {
    const group = [...order];
    placeAt(group, alone.id, order, position);
    for (const id of group) d.get(id).siblings = [...group];
  }
}

/**
 * Links `ofId` to `otherId`, someone already in the tree, as their parent,
 * sibling or child. A child also gets `otherParent` (a spouse of `ofId`)
 * when they have no other parent yet.
 */
export function linkRelative(
  people: People,
  ofId: string,
  relation: LinkRelation,
  otherId: string,
  opts: { before?: boolean; otherParent?: string } = {},
): Change {
  if (ofId === otherId) throw new RelationError("Someone can't be their own relative.");
  if (!people.has(ofId) || !people.has(otherId)) throw new RelationError('Unknown person');
  const d = new Draft(people);
  if (relation === 'parent') linkParent(d, people, ofId, otherId);
  else if (relation === 'child') {
    const hadParents = !!people.get(otherId)!.parents?.length;
    linkParent(d, people, otherId, ofId);
    if (opts.otherParent && !hadParents) linkParent(d, d.view(), otherId, opts.otherParent);
  } else linkSibling(d, people, ofId, otherId, opts.before);
  return d.result();
}

/**
 * People already in the tree who can be linked as `relation` of `ofId`: one
 * generation above for a parent, the same for a sibling, one below for a
 * child, and only where the link is allowed (see linkRelative).
 */
export function linkCandidates(people: People, rootId: string, ofId: string, relation: LinkRelation): string[] {
  const gen = generations(people, rootId);
  const target = gen.get(ofId)! + { parent: -1, sibling: 0, child: 1 }[relation];
  return [...people.keys()].filter((id) => {
    if (id === ofId || gen.get(id) !== target) return false;
    try {
      linkRelative(people, ofId, relation, id);
      return true;
    } catch {
      return false;
    }
  });
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
 * Deletes `id`, a person at the end of a branch: no one else may be cut off
 * from `rootId`, and someone with both parents and children (in the middle
 * of a line) cannot go. Children of a top-most ancestor left without parents
 * stay together as siblings. The user's own card cannot be deleted.
 */
export function deletePerson(people: People, rootId: string, id: string): Change {
  if (id === rootId) throw new RelationError("You can't delete your own card.");
  const target = people.get(id);
  if (!target) throw new RelationError('Unknown person');
  if (target.parents?.length && target.children?.length)
    throw new RelationError(
      `${target.name} has parents and children in the tree. Only people at the end of a branch can be deleted.`,
    );
  const d = new Draft(people);
  const orphans = (target.children ?? []).filter((c) => people.get(c)?.parents?.every((p) => p === id));
  for (const n of neighbors(target)) cut(d, n, id);
  if (orphans.length > 1) for (const o of orphans) d.get(o).siblings = [...orphans];

  const after = d.view();
  after.delete(id);
  const lost = people.size - 1 - reachable(after, rootId).size;
  if (lost > 0) {
    throw new RelationError(
      `Deleting ${target.name} would cut off ${lost === 1 ? '1 person' : `${lost} people`} from your tree. Delete them first.`,
    );
  }
  return d.result([id]);
}

/** Moves `id` to birth-order `position` (0 = eldest) among their full siblings. */
export function reorder(people: People, id: string, position: number): Change {
  const d = new Draft(people);
  const p = d.get(id);
  const order = siblingsOf(people, id).filter((s) => s !== id);
  if (p.parents?.length) {
    for (const parent of p.parents) {
      const kids = list(d.get(parent), 'children');
      kids.splice(kids.indexOf(id), 1);
      placeAt(kids, id, order, position);
    }
  } else {
    const group = [...order];
    placeAt(group, id, order, position);
    for (const s of group) d.get(s).siblings = [...group];
  }
  return d.result();
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
