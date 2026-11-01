import {
  Component,
  DestroyRef,
  computed,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import {
  AlertController,
  IonButton,
  IonCard,
  IonContent,
  IonIcon,
  IonSkeletonText,
  IonSpinner,
  IonText,
  MenuController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, heart, locateOutline, remove } from 'ionicons/icons';

import { TopActionsComponent } from '../shared/top-actions.component';
import {
  CARD_H,
  CARD_W,
  cardMid,
  layoutTree,
  SPOUSE_STEP,
  withPlaceholders,
  type Household,
  type Layout,
  type Line,
} from '../tree/layout';
import { PersonCardComponent, type AddRequest } from '../tree/person-card.component';
import { PersonEditComponent, type PersonForm } from '../tree/person-edit.component';
import { PersonProfileComponent } from '../tree/person-profile.component';
import { childrenOf, hasLivingSpouse, pathTo, RelationError, siblingsOf, spouseCandidates } from '../tree/relations';
import { TreeService, type Person, type SavedView } from '../tree/tree.service';
import { zoomAt, type View } from '../tree/view';

type Point = { x: number; y: number };
/** Height of the marriage line and heart between spouses' cards: the middle of the photo. */
const HEART_Y = 82;
/** Width of a household: its cards side by side. */
const width = (h: Household) => CARD_W + (h.members.length - 1) * SPOUSE_STEP;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The open edit/add form: what it shows and what saving does. */
interface Form {
  person: Person;
  title: string;
  relations: { id: string; name: string; label: string }[];
  canDelete: boolean;
  /** Birth-order choice for a new child or sibling: positions offered and the preselected one. */
  orderSlots?: number;
  orderDefault?: number;
  /** Adding a spouse of this person: someone already in the tree can be picked instead. */
  spouseOf?: string;
  submit: (details: PersonForm) => Promise<unknown>;
}

/** Home: the family-tree canvas, centered on the user's own card. */
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonButton,
    IonCard,
    IonContent,
    IonIcon,
    IonSkeletonText,
    IonSpinner,
    IonText,
    PersonCardComponent,
    PersonEditComponent,
    PersonProfileComponent,
    TopActionsComponent,
  ],
})
export class HomePage {
  private readonly tree = inject(TreeService);
  private readonly menu = inject(MenuController);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  protected readonly people = this.tree.people;
  protected readonly layout = signal<Layout | null>(null);
  protected readonly view = signal<View>({ x: 0, y: 0, z: 1 });
  protected readonly dragging = signal(false);
  /** Household whose cards show their buttons (touch has no hover). */
  protected readonly open = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly form = signal<Form | null>(null);
  /** Household under the mouse; its families' lines are highlighted (also for the open one). */
  protected readonly hovered = signal<string | null>(null);
  /** Lines grouped by family, in drawing order. */
  protected readonly lineGroups = computed(() => {
    const groups = new Map<string, Line[]>();
    for (const line of this.layout()?.lines ?? []) {
      const g = groups.get(line.family);
      if (g) g.push(line);
      else groups.set(line.family, [line]);
    }
    return [...groups].map(([family, lines]) => ({ family, lines }));
  });
  /** Families (to their parents and to their children) of the hovered or open household. */
  protected readonly highlighted = computed(() => {
    const id = this.hovered() ?? this.open();
    const families = new Set<string>();
    if (!id) return families;
    for (const line of this.layout()?.lines ?? []) if (line.id.includes(`${id}:`)) families.add(line.family);
    return families;
  });
  /** People who can be picked as the spouse (null until loaded). */
  protected readonly candidates = signal<{ id: string; name: string; hint: string }[] | null>(null);
  /** Person whose profile popup is open. */
  protected readonly profileId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  /** Active pointers (mouse or fingers) on the empty canvas, in client coordinates. */
  private readonly pointers = new Map<number, Point>();
  private layoutRun = 0;
  /** The current tap only showed a household's buttons (see tapHousehold). */
  private firstTap = false;
  private loadTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  /** Saved position waiting for its person to be laid out. */
  private restore: SavedView | null = null;
  private lastSaved = '';
  protected readonly hasLivingSpouse = hasLivingSpouse;
  protected readonly cardWidth = CARD_W;
  protected readonly cardHeight = CARD_H;

  constructor() {
    addIcons({ add, heart, locateOutline, remove });
    // Keep whatever is in the middle of the screen in the middle when the canvas
    // resizes. This also centers the own card on start: ion-content may report
    // zero width or height at first, and the view starts at (0, 0).
    let size = { w: 0, h: 0 };
    let observer: ResizeObserver | undefined;
    afterNextRender(() => {
      observer = new ResizeObserver(() => {
        const { clientWidth: w, clientHeight: h } = this.canvas().nativeElement;
        this.view.update((v) => ({ ...v, x: v.x + (w - size.w) / 2, y: v.y + (h - size.h) / 2 }));
        size = { w, h };
      });
      observer.observe(this.canvas().nativeElement);
    });
    // Re-layout whenever people change; only the latest run wins. Linked people
    // not loaded yet get placeholders, so the layout already keeps their place.
    effect(() => {
      const people = this.people();
      if (!people.size) return;
      const run = ++this.layoutRun;
      layoutTree(withPlaceholders(people, this.tree.unloaded()), this.tree.rootId).then(
        (layout) => {
          if (run !== this.layoutRun) return;
          this.layout.set(layout);
          this.restoreView(layout);
        },
        () => this.loadError.set("Couldn't draw your family tree."),
      );
    });
    // While panning and zooming, load the placeholders within one screen of the visible area.
    effect(() => {
      const view = this.view();
      const layout = this.layout();
      if (!layout) return;
      clearTimeout(this.loadTimer);
      this.loadTimer = setTimeout(() => this.loadNear(view, layout), 150);
    });
    // "Remember last position": save 2 s after the view stops moving, and when leaving.
    effect(() => {
      const view = this.view();
      const layout = this.layout();
      if (!layout || !this.tree.rememberView()) return;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveView(view, layout), 2000);
    });
    const flush = () => this.flushView();
    addEventListener('pagehide', flush);
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      clearTimeout(this.loadTimer);
      clearTimeout(this.saveTimer);
      removeEventListener('pagehide', flush);
    });
    void this.load();
  }

  /** Loads placeholders whose card is on screen or within one screen of it. */
  private loadNear(view: View, layout: Layout): void {
    const { clientWidth: w, clientHeight: h } = this.canvas().nativeElement;
    // Visible area in world coordinates, grown by one screen on every side.
    const [mx, my] = [w / view.z, h / view.z];
    const left = -view.x / view.z - mx;
    const top = -view.y / view.z - my;
    const near = layout.households.filter(
      (hh) => hh.x + width(hh) > left && hh.x < left + 3 * mx && hh.y + CARD_H > top && hh.y < top + 3 * my,
    );
    const isGhost = (hh: Household) => hh.members.some((id) => !this.people().has(id));
    let load = near.filter(isGhost);
    if (!near.length) {
      // Panned past everything loaded (e.g. quickly, far up a long line of
      // ancestors): if the nearest placeholder is closer than any loaded card,
      // the user is heading into unloaded tree, so load it; each load moves the
      // edge closer until the view fills. Empty space beside the tree loads nothing.
      const centre = { x: left + 1.5 * mx, y: top + 1.5 * my };
      const distance = (hh: Household) => Math.hypot(hh.x + width(hh) / 2 - centre.x, hh.y + CARD_H / 2 - centre.y);
      const nearest = [...layout.households].sort((a, b) => distance(a) - distance(b))[0];
      load = nearest && isGhost(nearest) ? [nearest] : [];
    }
    const ids = load.flatMap((hh) => hh.members).filter((id) => !this.people().has(id));
    if (ids.length) void this.tree.loadMore(ids).catch(() => undefined); // retried on the next pan
  }

  // Dragging from the screen edge pans the canvas instead of opening the side menu.
  ionViewWillEnter(): void {
    void this.menu.swipeGesture(false);
  }

  ionViewWillLeave(): void {
    void this.menu.swipeGesture(true);
    this.flushView();
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      // Settings are optional: without them the tree simply opens on the own card.
      const [saved] = await Promise.all([this.tree.loadSettings().catch(() => null), this.tree.load()]);
      if (saved) {
        this.restore = saved;
        await this.tree.loadMore(saved.path); // the chain to the saved person, so the layout includes them
      }
    } catch {
      this.loadError.set("Couldn't load your family tree. Check your connection.");
    }
  }

  /** Puts the user's own card in the middle of the screen at 100 %. */
  center(): void {
    const { clientWidth, clientHeight } = this.canvas().nativeElement;
    this.view.set({ x: clientWidth / 2, y: clientHeight / 2, z: 1 });
  }

  /** How a person is related to the line above their card: son, daughter, sister, ... */
  protected relationLabel(id: string): string | null {
    const p = this.people().get(id);
    if (!p) return null;
    const [m, f, other] = p.parents?.length ? ['Son', 'Daughter', 'Child'] : ['Brother', 'Sister', 'Sibling'];
    return p.gender === 'male' ? m : p.gender === 'female' ? f : other;
  }

  /** From partner `j`'s card to card `i`, at photo height, behind any cards between. */
  protected marriagePath(j: number, i: number): string {
    return `M${j * SPOUSE_STEP + CARD_W},${HEART_Y} H${i * SPOUSE_STEP}`;
  }

  /**
   * For a spouse's card: 1 + the index of the nearest card before
   * it that is their spouse (so 0 means none), for the marriage line and heart.
   */
  protected partnerIndex(h: Household, i: number): number {
    const me = this.people().get(h.members[i]);
    for (let j = i - 1; j >= 0; j--) {
      const other = this.people().get(h.members[j]);
      if (me?.spouses?.includes(h.members[j]) || other?.spouses?.includes(h.members[i])) return j + 1;
    }
    return 0;
  }

  /** Center of a member's card. */
  private cardCenter(h: Household, i: number): { x: number; y: number } {
    return { x: h.x + cardMid(i), y: h.y + CARD_H / 2 };
  }

  /** Moves the view to the saved position once its person is laid out. */
  private restoreView(layout: Layout): void {
    const saved = this.restore;
    if (!saved) return;
    const h = layout.households.find((hh) => hh.members.includes(saved.focus));
    if (!h) {
      // The saved person is gone (deleted, or no longer connected): start on the own card.
      if (!this.tree.unloaded().size || !saved.path.some((id) => this.tree.unloaded().has(id))) this.restore = null;
      return;
    }
    const c = this.cardCenter(h, h.members.indexOf(saved.focus));
    const { clientWidth: w, clientHeight: hh } = this.canvas().nativeElement;
    this.view.set({ x: w / 2 - (c.x + saved.dx) * saved.z, y: hh / 2 - (c.y + saved.dy) * saved.z, z: saved.z });
    this.restore = null;
  }

  /** Saves the person nearest the middle of the screen and the offset from them. */
  private saveView(view: View, layout: Layout): void {
    if (!this.tree.rememberView() || this.restore) return;
    const { clientWidth: w, clientHeight: hh } = this.canvas().nativeElement;
    const mid = { x: (w / 2 - view.x) / view.z, y: (hh / 2 - view.y) / view.z };
    let best: { id: string; x: number; y: number; d: number } | undefined;
    for (const h of layout.households) {
      h.members.forEach((id, i) => {
        if (!this.people().has(id)) return;
        const c = this.cardCenter(h, i);
        const d = Math.hypot(c.x - mid.x, c.y - mid.y);
        if (!best || d < best.d) best = { id, ...c, d };
      });
    }
    if (!best) return;
    const path = pathTo(this.people(), this.tree.rootId, best.id);
    if (!path) return;
    const round = (n: number) => Math.round(n * 100) / 100;
    const saved: SavedView = {
      focus: best.id,
      path,
      dx: round(mid.x - best.x),
      dy: round(mid.y - best.y),
      z: round(view.z),
    };
    const key = JSON.stringify(saved);
    if (key === this.lastSaved) return;
    this.lastSaved = key;
    void this.tree.saveView(saved).catch(() => (this.lastSaved = '')); // retried on the next move
  }

  private flushView(): void {
    clearTimeout(this.saveTimer);
    const layout = this.layout();
    try {
      if (layout) this.saveView(this.view(), layout);
    } catch {
      // Leaving because of sign-out: the session is gone, nothing to save.
    }
  }

  zoomBy(factor: number): void {
    const { clientWidth, clientHeight } = this.canvas().nativeElement;
    this.view.update((v) => zoomAt(v, factor, clientWidth / 2, clientHeight / 2));
  }

  protected down(e: PointerEvent): void {
    // Cards and buttons keep normal pointer behavior (clicks, text selection).
    if ((e.target as Element).closest('.node, ion-button')) return;
    this.open.set(null);
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragging.set(true);
  }

  protected move(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    const other = [...this.pointers].find(([id]) => id !== e.pointerId)?.[1];
    if (!other) {
      this.view.update((v) => ({ ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }));
    } else {
      // Pinch: zoom by the change in finger distance, pan by the midpoint's movement.
      const box = this.canvas().nativeElement.getBoundingClientRect();
      const [m0, m1] = [mid(prev, other), mid(cur, other)];
      this.view.update((v) => {
        const z = zoomAt(v, dist(cur, other) / (dist(prev, other) || 1), m1.x - box.left, m1.y - box.top);
        return { ...z, x: z.x + m1.x - m0.x, y: z.y + m1.y - m0.y };
      });
    }
    this.pointers.set(e.pointerId, cur);
  }

  protected up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    this.dragging.set(this.pointers.size > 0);
  }

  protected wheel(e: WheelEvent): void {
    e.preventDefault();
    const box = this.canvas().nativeElement.getBoundingClientRect();
    this.view.update((v) => zoomAt(v, Math.exp(-e.deltaY * 0.002), e.clientX - box.left, e.clientY - box.top));
  }

  protected key(e: KeyboardEvent): void {
    if (e.target !== e.currentTarget) return; // typing inside a card or form
    const step = 60;
    const moves: Record<string, Point> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    if (moves[e.key]) this.view.update((v) => ({ ...v, x: v.x + moves[e.key].x, y: v.y + moves[e.key].y }));
    else if (e.key === '+' || e.key === '=') this.zoomBy(1.25);
    else if (e.key === '-') this.zoomBy(0.8);
    else return;
    e.preventDefault();
  }

  async startEdit(person: Person): Promise<void> {
    // Names in the relationship list, and the siblings for the birth order.
    await this.tree.loadFamily(person.id).catch(() => undefined);
    const people = this.people();
    person = people.get(person.id) ?? person;
    const name = (id: string) => people.get(id)?.name ?? 'Unknown';
    const rel = (ids: string[] | undefined, label: string) =>
      (ids ?? []).filter((id) => id !== person.id).map((id) => ({ id, name: name(id), label }));
    const siblings = siblingsOf(people, person.id);
    const orderSlots = siblings.length > 1 ? siblings.length : 0;
    const orderDefault = siblings.indexOf(person.id);
    this.form.set({
      person,
      title: 'Edit details',
      relations: [
        ...rel(person.parents, 'Parent'),
        ...rel(person.spouses, 'Spouse'),
        ...rel(person.siblings, 'Sibling'),
        ...rel(person.children, 'Child'),
      ],
      // Only people at the end of a branch (see deletePerson); the rest is checked on delete.
      canDelete: person.id !== this.tree.rootId && !(person.parents?.length && person.children?.length),
      orderSlots,
      orderDefault,
      submit: (details) =>
        this.tree.save(person.id, details, orderSlots && details.order !== orderDefault ? details.order : undefined),
    });
  }

  /**
   * Touch has no hover: the first tap on a household (a person and their
   * spouses) shows its buttons; tapping a card of the open household shows the profile.
   */
  protected tapHousehold(id: string, e: PointerEvent): void {
    this.firstTap = e.pointerType !== 'mouse' && this.open() !== id;
    this.open.set(id);
  }

  protected showProfile(id: string): void {
    if (this.firstTap) this.firstTap = false;
    else this.profileId.set(id);
  }

  /** Edit button on the profile popup: close it, then open the form. */
  protected editFromProfile(person: Person): void {
    this.profileId.set(null);
    void this.startEdit(person);
  }

  async startAdd(of: Person, req: AddRequest): Promise<void> {
    let otherParent: string | undefined;
    if (req.relation === 'child' && of.spouses?.length) {
      const choice = await this.ask(`Who is the child's other parent?`, [
        ...of.spouses.map((id, i) => ({
          label: this.people().get(id)?.name ?? 'Unknown',
          value: id,
          checked: i === 0,
        })),
        { label: 'Someone else or unknown', value: '' },
      ]);
      if (choice === undefined) return;
      otherParent = choice || undefined;
    }
    // Birth order: offer every position among the full siblings; preselect the
    // side of the button that was used (siblings) or youngest (children).
    let orderSlots = 0;
    let orderDefault = 0;
    if (req.relation === 'child' || req.relation === 'sibling') {
      if (!(await this.run(() => this.tree.loadFamily(of.id)))) return;
      const people = this.people();
      if (req.relation === 'child') {
        orderSlots = childrenOf(people, otherParent ? [of.id, otherParent] : [of.id]).length + 1;
        orderDefault = orderSlots - 1;
      } else {
        const siblings = siblingsOf(people, of.id);
        orderSlots = siblings.length + 1;
        orderDefault = siblings.indexOf(of.id) + (req.before ? 0 : 1);
      }
    }
    this.form.set({
      person: { id: '', name: '' },
      title: `Add ${req.relation} of ${of.name}`,
      relations: [],
      canDelete: false,
      orderSlots,
      orderDefault,
      spouseOf: req.relation === 'spouse' ? of.id : undefined,
      submit: (details) =>
        this.tree.add(of.id, req.relation, details, { otherParent, position: orderSlots ? details.order : undefined }),
    });
  }

  async save(details: PersonForm): Promise<void> {
    const form = this.form();
    if (!form) return;
    if (await this.run(() => form.submit(details))) this.closeForm();
  }

  /** "Already in your tree": everyone who could be the spouse, with who their parents are. */
  async findExisting(): Promise<void> {
    const of = this.form()?.spouseOf;
    if (!of || !(await this.run(() => this.tree.loadAll()))) return;
    const people = this.people();
    this.candidates.set(
      spouseCandidates(people, of)
        .map((id) => {
          const p = people.get(id)!;
          const parents = (p.parents ?? []).map((x) => people.get(x)?.name).filter(Boolean);
          const hint = parents.length ? `${this.relationLabel(id)} of ${parents.join(' and ')}` : '';
          return { id, name: p.name, hint };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  async linkSpouse(id: string): Promise<void> {
    const of = this.form()?.spouseOf;
    if (of && (await this.run(() => this.tree.linkSpouse(of, id)))) this.closeForm();
  }

  async unlink(otherId: string): Promise<void> {
    const person = this.form()?.person;
    if (!person) return;
    const other = this.people().get(otherId)?.name ?? 'this person';
    if (!(await this.confirm(`Remove the relationship between ${person.name} and ${other}?`, 'Remove'))) return;
    if (await this.run(() => this.tree.unlink(person.id, otherId))) await this.startEdit(this.people().get(person.id)!);
  }

  async remove(): Promise<void> {
    const person = this.form()?.person;
    if (!person) return;
    if (!(await this.run(() => this.tree.planDelete(person.id)))) return; // explains why not, if not allowed
    if (!(await this.confirm(`Delete ${person.name}? This cannot be undone.`, 'Delete'))) return;
    if (await this.run(() => this.tree.delete(person.id))) this.closeForm();
  }

  closeForm(): void {
    this.form.set(null);
    this.candidates.set(null);
    this.saveError.set(null);
  }

  /** Runs a change with the busy flag; shows rule violations and network errors. */
  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await action();
      return true;
    } catch (e) {
      const message = e instanceof RelationError ? e.message : "Couldn't save. Check your connection and try again.";
      this.saveError.set(message);
      const toast = await this.toasts.create({ message, color: 'danger', duration: 4000, position: 'bottom' });
      await toast.present();
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private async confirm(message: string, action: string): Promise<boolean> {
    const alert = await this.alerts.create({
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: action, role: 'destructive' },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'destructive';
  }

  /** Radio choice; undefined when cancelled. */
  private async ask(header: string, options: { label: string; value: string; checked?: boolean }[]) {
    const alert = await this.alerts.create({
      header,
      inputs: options.map((o) => ({ type: 'radio' as const, ...o })),
      buttons: [{ text: 'Cancel', role: 'cancel' }, { text: 'OK' }],
    });
    await alert.present();
    const { data, role } = await alert.onDidDismiss<{ values: string }>();
    return role === 'cancel' || role === 'backdrop' ? undefined : (data?.values ?? '');
  }
}
