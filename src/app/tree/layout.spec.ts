import { CARD_H, CARD_W, households, layoutTree, roundedPath, withPlaceholders } from './layout';
import type { Person } from './tree.service';

const people = new Map<string, Person>(
  [
    { id: 'me', name: 'Me', parents: ['dad', 'mum'], spouses: ['wife'], children: ['kid'] },
    { id: 'dad', name: 'Dad', spouses: ['mum'], children: ['sis', 'me'] },
    { id: 'mum', name: 'Mum', spouses: ['dad'], children: ['sis', 'me'] },
    { id: 'sis', name: 'Sis', parents: ['dad', 'mum'] },
    { id: 'wife', name: 'Wife', spouses: ['me'], children: ['kid'] },
    { id: 'kid', name: 'Kid', parents: ['me', 'wife'] },
  ].map((p) => [p.id, p as Person]),
);

describe('family layout', () => {
  it('groups spouses into households, own card in front', () => {
    // Depth-first: the own family (parents, then their other children) before the children.
    expect(households(people, 'me')).toEqual([['me', 'wife'], ['dad', 'mum'], ['sis'], ['kid']]);
  });

  it('puts parents above and children below, centered on the own card, with lines between', async () => {
    const { households: hs, lines } = await layoutTree(people, 'me');
    const y = (id: string) => hs.find((h) => h.members.includes(id))!.y;
    const x = (id: string) => hs.find((h) => h.members.includes(id))!.x;
    expect(y('dad')).toBeLessThan(y('me'));
    expect(y('kid')).toBeGreaterThan(y('me'));
    expect(y('sis')).toBe(y('me')); // same row, whatever the stack size
    expect(x('sis')).toBeLessThan(x('me')); // listed before "me" by the parents
    // Own front card centered on (0, 0).
    expect(x('me') + CARD_W / 2).toBe(0);
    expect(y('me') + CARD_H / 2).toBe(0);
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  it('adds placeholders for unloaded relatives, linked back to the loaded people', async () => {
    const loaded = new Map([...people].filter(([id]) => ['me', 'wife', 'kid'].includes(id)));
    const all = withPlaceholders(loaded, new Set(['dad', 'mum']));
    expect(all.get('dad')).toEqual({ id: 'dad', name: '', children: ['me'] });
    expect(all.get('mum')!.children).toEqual(['me']);
    expect(all.has('sis')).toBe(false); // not linked from anyone loaded
    const { households: hs } = await layoutTree(all, 'me');
    expect(hs.find((h) => h.members.includes('dad'))!.y).toBeLessThan(0);
  });

  it("places a spouse's parents on the spouse's side, connected to the spouse's card", async () => {
    const tree = new Map(people);
    tree.set('wife', { ...people.get('wife')!, parents: ['wdad'] });
    tree.set('wdad', { id: 'wdad', name: 'Wife dad', children: ['wife'] });
    tree.set('dad', { ...people.get('dad')!, parents: ['gpa'] });
    tree.set('gpa', { id: 'gpa', name: 'Grandpa', children: ['uncle', 'dad'] });
    tree.set('uncle', { id: 'uncle', name: 'Uncle', parents: ['gpa'] });
    const { households: hs } = await layoutTree(tree, 'me');
    const h = (id: string) => hs.find((hh) => hh.members.includes(id))!;
    expect(h('me').linked).toEqual([true, true]); // both cards in the stack have a line from their parents
    expect(h('wdad').x).toBeGreaterThan(h('dad').x); // her family on her side...
    expect(h('wdad').x).toBeGreaterThan(h('uncle').x); // ...outside his parents' families
  });

  it('rounds corners of orthogonal paths', () => {
    expect(
      roundedPath([
        { x: 0, y: 0 },
        { x: 0, y: 50 },
        { x: 50, y: 50 },
      ]),
    ).toBe('M0,0 L0,40 Q0,50 10,50 L50,50');
  });
});
