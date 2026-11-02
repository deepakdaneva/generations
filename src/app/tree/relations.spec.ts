import {
  addRelative,
  deletePerson,
  hasLivingSpouse,
  generations,
  linkCandidates,
  linkRelative,
  pathTo,
  RelationError,
  reorder,
  unlink,
  type Change,
  type People,
  type Relation,
} from './relations';
import type { Person } from './tree.service';

/** Applies a change to a copy of `people`. */
function apply(people: People, change: Change): Map<string, Person> {
  const next = new Map(people);
  for (const id of change.remove) next.delete(id);
  for (const p of change.write) next.set(p.id, p);
  return next;
}

const me: Person = { id: 'me', name: 'Me' };
let tree: Map<string, Person>;
const add = (of: string, relation: Relation, id: string, opts = {}) =>
  (tree = apply(tree, addRelative(tree, of, relation, { id, name: id }, opts)));
const get = (id: string) => tree.get(id)!;

beforeEach(() => (tree = new Map([['me', me]])));

describe('addRelative', () => {
  it('links parents and children on both sides; the second parent becomes a spouse', () => {
    add('me', 'parent', 'dad');
    add('me', 'parent', 'mum');
    expect(get('me').parents).toEqual(['dad', 'mum']);
    expect(get('dad').children).toEqual(['me']);
    expect(get('mum').spouses).toEqual(['dad']);
    expect(get('dad').spouses).toEqual(['mum']);
    expect(() => add('me', 'parent', 'third')).toThrow(RelationError);
  });

  it('adds siblings as children of the same parents, left or right', () => {
    add('me', 'parent', 'dad');
    add('me', 'sibling', 'right');
    add('me', 'sibling', 'left', { before: true });
    expect(get('dad').children).toEqual(['left', 'me', 'right']);
    expect(get('left').parents).toEqual(['dad']);
    expect(get('me').siblings).toBeUndefined();
  });

  it('places children and siblings by birth order, eldest first', () => {
    add('me', 'spouse', 'wife');
    add('me', 'child', 'second', { otherParent: 'wife' });
    add('me', 'child', 'third', { otherParent: 'wife' }); // youngest by default
    add('me', 'child', 'first', { otherParent: 'wife', position: 0 });
    expect(get('me').children).toEqual(['first', 'second', 'third']);
    expect(get('wife').children).toEqual(['first', 'second', 'third']);
    // A half-sibling (other parents) does not count in this family's order.
    add('me', 'child', 'half');
    add('third', 'sibling', 'between', { position: 2 });
    expect(get('me').children).toEqual(['first', 'second', 'between', 'third', 'half']);
    expect(get('between').parents).toEqual(['me', 'wife']);
  });

  it('groups siblings without parents, and a later parent adopts the whole group', () => {
    add('me', 'sibling', 'sis');
    add('me', 'sibling', 'bro', { before: true });
    expect(get('sis').siblings).toEqual(['bro', 'me', 'sis']);
    add('sis', 'parent', 'mum');
    expect(get('mum').children).toEqual(['bro', 'me', 'sis']);
    expect(get('bro').parents).toEqual(['mum']);
    expect(get('bro').siblings).toBeUndefined();
  });

  it('adds children with an optional second parent who must be a spouse', () => {
    add('me', 'spouse', 'wife');
    add('me', 'child', 'kid', { otherParent: 'wife' });
    expect(get('kid').parents).toEqual(['me', 'wife']);
    expect(get('wife').children).toEqual(['kid']);
    expect(() => add('me', 'child', 'x', { otherParent: 'kid' })).toThrow(RelationError);
  });
});

describe('unlink', () => {
  it('removes a relationship from both people', () => {
    add('me', 'spouse', 'wife');
    add('me', 'child', 'kid', { otherParent: 'wife' });
    tree = apply(tree, unlink(tree, 'me', 'me', 'wife'));
    expect(get('me').spouses).toBeUndefined();
    expect(get('wife').spouses).toBeUndefined();
  });

  it('refuses when it would cut people off from your card', () => {
    add('me', 'parent', 'dad');
    add('dad', 'parent', 'grandpa');
    expect(() => unlink(tree, 'me', 'me', 'dad')).toThrow(/only connection to 2 people/);
  });
});

describe('deletePerson', () => {
  it('deletes a person at the end of a branch', () => {
    add('me', 'spouse', 'wife');
    add('me', 'child', 'kid');
    tree = apply(tree, deletePerson(tree, 'me', 'kid'));
    expect(tree.has('kid')).toBe(false);
    expect(get('me').children).toBeUndefined();
  });

  it('refuses people with both parents and children', () => {
    add('me', 'parent', 'dad');
    add('dad', 'parent', 'grandpa');
    expect(() => deletePerson(tree, 'me', 'dad')).toThrow(/end of a branch/);
  });

  it('refuses when someone would be cut off', () => {
    add('me', 'spouse', 'wife');
    add('wife', 'parent', 'inlaw');
    expect(() => deletePerson(tree, 'me', 'wife')).toThrow(/cut off 1 person/);
  });

  it('deletes a top-most ancestor; their children stay together as siblings', () => {
    add('me', 'parent', 'dad');
    add('me', 'sibling', 'sis');
    tree = apply(tree, deletePerson(tree, 'me', 'dad'));
    expect(get('me').siblings).toEqual(['me', 'sis']);
    expect(get('sis').siblings).toEqual(['me', 'sis']);
  });

  it("refuses to delete the user's own card", () => {
    expect(() => deletePerson(tree, 'me', 'me')).toThrow(RelationError);
  });
});

describe('marrying again', () => {
  it('adds no second spouse while the first is alive; a widow or widower can marry again', () => {
    add('me', 'spouse', 'first');
    expect(hasLivingSpouse(tree, 'me')).toBe(true);
    expect(() => add('me', 'spouse', 'second')).toThrow(/already married/);
    tree.set('first', { ...get('first'), death: '2020-01-01' });
    expect(hasLivingSpouse(tree, 'me')).toBe(false);
    add('me', 'spouse', 'second');
    expect(get('me').spouses).toEqual(['first', 'second']);
  });

  it('adds no spouse to someone who has died', () => {
    add('me', 'parent', 'dad');
    tree.set('dad', { ...get('dad'), death: '2001-02-03' });
    expect(() => add('dad', 'spouse', 'wife')).toThrow(/has died/);
  });
});

describe('linking people already in the tree', () => {
  /** Two brothers (me, bro) marry two sisters (d1, d2), each added as a new spouse first. */
  function brothersAndSisters() {
    add('me', 'parent', 'pa');
    add('me', 'sibling', 'bro');
    add('me', 'spouse', 'd1');
    add('d1', 'parent', 'pb');
    add('bro', 'spouse', 'd2');
  }

  it('numbers generations from the own card', () => {
    brothersAndSisters();
    const gen = generations(tree, 'me');
    expect([gen.get('pa'), gen.get('pb'), gen.get('d2')]).toEqual([-1, -1, 0]);
  });

  it("links an existing parent one generation up: the wife's sister gets her father", () => {
    brothersAndSisters();
    expect(linkCandidates(tree, 'me', 'd2', 'parent')).toEqual(['pb']); // not her husband's parent
    tree = apply(tree, linkRelative(tree, 'd2', 'parent', 'pb'));
    expect(get('d2').parents).toEqual(['pb']);
    expect(get('pb').children).toEqual(['d1', 'd2']);
  });

  it('links an existing sibling in the same generation, on the chosen side', () => {
    brothersAndSisters();
    expect(linkCandidates(tree, 'me', 'd1', 'sibling')).toEqual(['d2']); // not her husband or his brother's family
    tree = apply(tree, linkRelative(tree, 'd1', 'sibling', 'd2', { before: true }));
    expect(get('d2').parents).toEqual(['pb']);
    expect(get('pb').children).toEqual(['d2', 'd1']);
  });

  it('links an existing child one generation down, with the other parent', () => {
    add('me', 'child', 'kid');
    add('kid', 'spouse', 'kw'); // one generation below, no parents yet
    add('me', 'sibling', 'bro');
    add('bro', 'spouse', 'bw');
    expect(linkCandidates(tree, 'me', 'bro', 'child')).toContain('kw');
    expect(linkCandidates(tree, 'me', 'bro', 'child')).not.toContain('me');
    tree = apply(tree, linkRelative(tree, 'bro', 'child', 'kw', { otherParent: 'bw' }));
    expect(get('kw').parents).toEqual(['bro', 'bw']);
    expect(get('bw').children).toEqual(['kw']);
  });

  it('refuses links that make no sense', () => {
    add('me', 'parent', 'dad');
    add('me', 'spouse', 'wife');
    add('me', 'child', 'kid');
    expect(() => linkRelative(tree, 'me', 'parent', 'me')).toThrow(RelationError);
    expect(() => linkRelative(tree, 'me', 'parent', 'kid')).toThrow(/can't be a parent/);
    expect(() => linkRelative(tree, 'me', 'sibling', 'wife')).toThrow(/already related/);
  });
});

describe('reorder', () => {
  it('moves a child in the birth order of both parents', () => {
    add('me', 'parent', 'dad');
    add('me', 'parent', 'mum');
    add('me', 'sibling', 'b');
    add('b', 'sibling', 'c');
    tree = apply(tree, reorder(tree, 'c', 0));
    expect(get('dad').children).toEqual(['c', 'me', 'b']);
    expect(get('mum').children).toEqual(['c', 'me', 'b']);
    tree = apply(tree, reorder(tree, 'c', 2));
    expect(get('dad').children).toEqual(['me', 'b', 'c']);
  });

  it('moves a sibling without parents in the shared group', () => {
    add('me', 'sibling', 'b');
    tree = apply(tree, reorder(tree, 'b', 0));
    expect(get('me').siblings).toEqual(['b', 'me']);
    expect(get('b').siblings).toEqual(['b', 'me']);
  });
});

describe('pathTo', () => {
  it('finds the shortest chain of relatives', () => {
    add('me', 'parent', 'dad');
    add('dad', 'parent', 'grandpa');
    add('grandpa', 'child', 'uncle');
    add('me', 'spouse', 'wife');
    expect(pathTo(tree, 'me', 'uncle')).toEqual(['me', 'dad', 'grandpa', 'uncle']);
    expect(pathTo(tree, 'me', 'me')).toEqual(['me']);
    expect(pathTo(tree, 'me', 'nobody')).toBeNull();
  });
});
