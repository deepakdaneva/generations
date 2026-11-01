import { addRelative, deletePerson, RelationError, unlink, type Change, type People, type Relation } from './relations';
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
  it('also deletes people only connected through them', () => {
    add('me', 'parent', 'dad');
    add('dad', 'parent', 'grandpa');
    add('me', 'spouse', 'wife');
    const change = deletePerson(tree, 'me', 'dad');
    expect(change.remove.sort()).toEqual(['dad', 'grandpa']);
    tree = apply(tree, change);
    expect(get('me').parents).toBeUndefined();
    expect(get('wife').spouses).toEqual(['me']);
  });

  it('keeps children of a deleted parent together as siblings', () => {
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
