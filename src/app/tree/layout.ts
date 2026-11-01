import type { ElkExtendedEdge, ElkNode, ElkPoint } from 'elkjs/lib/elk-api';

import type { People } from './relations';
import type { Person } from './tree.service';

/** Cards have a fixed size so the layout never waits for rendering. */
export const CARD_W = 260;
export const CARD_H = 340;
/**
 * Each spouse card sits this much further up and right behind the front card.
 * Only the front card counts for the layout height, so rows stay aligned.
 */
export const STACK_OFFSET = 14;
/** Horizontal step between fanned-out spouse cards (card width plus room for the add buttons). */
export const SPREAD_STEP = 304;
/**
 * Lines reach a card's top straight down for at least this long, so the
 * relationship label and the line to a fanned-out spouse card fit above it.
 */
export const DROP = 56;

/** A person with their spouses, drawn as one stack of cards. Members: front card first; x/y: its top-left. */
export interface Household {
  id: string;
  members: string[];
  /** Per member: whether a line comes down to their card (from parents or a sibling group). */
  linked: boolean[];
  x: number;
  y: number;
}

export interface Line {
  id: string;
  d: string;
}

export interface Layout {
  households: Household[];
  lines: Line[];
}

/**
 * Adds a placeholder for every linked person not loaded yet, with the links
 * back to the loaded people, so the layout keeps their place and the canvas
 * can show a skeleton card there until they load.
 */
export function withPlaceholders(people: People, unloaded: ReadonlySet<string>): People {
  if (!unloaded.size) return people;
  const all = new Map(people);
  const ghost = (id: string) => {
    let g: Person | undefined = all.get(id);
    if (!g) all.set(id, (g = { id, name: '' }));
    return g;
  };
  const back = { parents: 'children', children: 'parents', spouses: 'spouses' } as const;
  for (const p of people.values()) {
    for (const key of ['parents', 'children', 'spouses'] as const) {
      for (const id of p[key] ?? []) if (unloaded.has(id)) (ghost(id)[back[key]] ??= []).push(p.id);
    }
    for (const id of p.siblings ?? []) if (unloaded.has(id)) ghost(id).siblings = p.siblings;
  }
  return all;
}

/**
 * Spouses (and spouses of spouses) form one household. Households are listed
 * depth-first from the root, each member's own family before the next
 * member's, so ELK places a person's side of the family (parents, their
 * siblings, grandparents) before, and apart from, their spouse's parents.
 */
export function households(people: People, rootId: string): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  const visit = (start: string) => {
    if (seen.has(start) || !people.has(start)) return;
    const members = [start];
    seen.add(start);
    // The loop also visits members pushed while iterating.
    for (const member of members) {
      for (const s of people.get(member)?.spouses ?? []) {
        if (!seen.has(s) && people.has(s)) {
          seen.add(s);
          members.push(s);
        }
      }
    }
    result.push(members);
    for (const id of members) {
      const p = people.get(id)!;
      for (const next of [...(p.parents ?? []), ...(p.siblings ?? []), ...(p.children ?? [])]) visit(next);
    }
  };
  visit(rootId);
  return result;
}

/** Whether a line comes down to this person's card: from their parents, or their sibling group. */
function isLinked(people: People, id: string): boolean {
  const p = people.get(id);
  return !!p?.parents?.some((x) => people.has(x)) || (p?.siblings?.length ?? 0) > 1;
}

/**
 * Builds the layered graph: households are nodes; each set of parents gets a
 * tiny "family" node that the parents' line drops into and the children's
 * lines leave from, which draws the classic family-tree bus. Siblings without
 * parents hang from a family node of their own.
 */
export function familyGraph(people: People, rootId: string): ElkNode {
  const groups = households(people, rootId);
  const householdOf = new Map<string, string>();
  for (const g of groups) for (const id of g) householdOf.set(id, `h:${g[0]}`);

  // Each card in a stack has its own port on top, where the line from its
  // parents arrives, so a spouse's parents connect to the spouse's card (and
  // sit on that side). Lines to children leave from one port at the bottom.
  const nodes: ElkNode[] = groups.map((g) => {
    const id = `h:${g[0]}`;
    return {
      id,
      width: CARD_W + (g.length - 1) * STACK_OFFSET,
      height: CARD_H,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [
        ...g.map((m, i) => ({
          id: `${id}:${m}`,
          x: i * STACK_OFFSET + CARD_W / 2,
          y: 0,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': 'NORTH' },
        })),
        {
          id: `${id}:down`,
          x: CARD_W / 2,
          y: CARD_H,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': 'SOUTH' },
        },
      ],
    };
  });
  const edges: ElkExtendedEdge[] = [];
  const families = new Set<string>();
  const edge = (from: string, to: string) => {
    const id = `${from}>${to}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, sources: [from], targets: [to] });
  };
  const family = (id: string, sources: string[], children: string[]) => {
    if (!families.has(id)) {
      families.add(id);
      nodes.push({ id, width: 1, height: 1 });
      for (const h of new Set(sources.map((s) => householdOf.get(s)!))) edge(`${h}:down`, id);
    }
    for (const c of children) edge(id, `${householdOf.get(c)!}:${c}`);
  };

  for (const g of groups) {
    for (const id of g) {
      const p = people.get(id)!;
      const parents = (p.parents ?? []).filter((x) => people.has(x));
      if (parents.length) {
        const key = `f:${[...parents].sort().join('+')}`;
        // Children in the order the first parent lists them (left/right siblings).
        const order = people.get(parents[0])!.children ?? [];
        family(
          key,
          parents,
          order.filter((c) => people.has(c) && sameParents(people, c, parents)),
        );
      } else if (p.siblings && p.siblings.length > 1) {
        family(
          `s:${p.siblings[0]}`,
          [],
          p.siblings.filter((s) => people.has(s)),
        );
      }
    }
  }

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '48',
      // Generous gaps between generations make parent-child links easy to follow.
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.spacing.edgeNodeBetweenLayers': String(DROP),
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: nodes,
    edges,
  };
}

function sameParents(people: People, child: string, parents: string[]): boolean {
  const own = (people.get(child)?.parents ?? []).filter((x) => people.has(x));
  return own.length === parents.length && own.every((x) => parents.includes(x));
}

/** SVG path through orthogonal points, with rounded corners. */
export function roundedPath(points: ElkPoint[], radius = 10): string {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const r = Math.min(radius, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const towards = (p: ElkPoint, q: ElkPoint) => {
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { x: p.x + ((q.x - p.x) / len) * r, y: p.y + ((q.y - p.y) / len) * r };
    };
    const [p1, p2] = [towards(b, a), towards(b, c)];
    d += ` L${p1.x},${p1.y} Q${b.x},${b.y} ${p2.x},${p2.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x},${last.y}`;
}

/**
 * Lays out the tree with ELK (loaded on first use, so it is not in the main
 * bundle). Coordinates are moved so the root's front card is centered on (0, 0).
 */
export async function layoutTree(people: People, rootId: string): Promise<Layout> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  // ponytail: runs on the main thread; fine for hundreds of people. Use ELK's web worker if it ever stutters.
  const graph = await new ELK().layout(familyGraph(people, rootId));

  const groups = new Map(households(people, rootId).map((g) => [`h:${g[0]}`, g]));
  const rootNode = graph.children!.find((n) => n.id === `h:${rootId}`)!;
  const ox = rootNode.x! + CARD_W / 2;
  const oy = rootNode.y! + CARD_H / 2;

  return {
    households: graph
      .children!.filter((node) => groups.has(node.id))
      .map((node) => {
        const members = groups.get(node.id)!;
        const linked = members.map((m) => isLinked(people, m));
        return { id: node.id, members, linked, x: node.x! - ox, y: node.y! - oy };
      }),
    lines: (graph.edges ?? []).flatMap((e) =>
      (e.sections ?? []).map((s) => ({
        id: e.id,
        d: roundedPath([s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({ x: p.x - ox, y: p.y - oy }))),
      })),
    ),
  };
}
