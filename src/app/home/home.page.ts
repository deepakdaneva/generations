import { Component, afterNextRender, effect, inject, signal, viewChild, type ElementRef } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonContent,
  IonIcon,
  IonSpinner,
  IonText,
  MenuController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, locateOutline, remove } from 'ionicons/icons';

import { TopActionsComponent } from '../shared/top-actions.component';
import { layoutTree, type Layout } from '../tree/layout';
import { PersonCardComponent, type AddRequest } from '../tree/person-card.component';
import { PersonEditComponent } from '../tree/person-edit.component';
import { RelationError } from '../tree/relations';
import { TreeService, type Person, type PersonDetails } from '../tree/tree.service';
import { zoomAt, type View } from '../tree/view';

type Point = { x: number; y: number };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The open edit/add form: what it shows and what saving does. */
interface Form {
  person: Person;
  title: string;
  relations: { id: string; name: string; label: string }[];
  canDelete: boolean;
  submit: (details: PersonDetails) => Promise<unknown>;
}

/** Home: the family-tree canvas, centered on the user's own card. */
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonButton,
    IonContent,
    IonIcon,
    IonSpinner,
    IonText,
    PersonCardComponent,
    PersonEditComponent,
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
  /** Household whose cards are fanned out and show their buttons (touch has no hover). */
  protected readonly open = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly form = signal<Form | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  /** Active pointers (mouse or fingers) on the empty canvas, in client coordinates. */
  private readonly pointers = new Map<number, Point>();
  private layoutRun = 0;

  constructor() {
    addIcons({ add, locateOutline, remove });
    // ion-content may still be zero-sized on first render; center once it has a size.
    afterNextRender(() => {
      const observer = new ResizeObserver(() => {
        if (!this.canvas().nativeElement.clientWidth) return;
        this.center();
        observer.disconnect();
      });
      observer.observe(this.canvas().nativeElement);
    });
    // Re-layout whenever people change; only the latest run wins.
    effect(() => {
      const people = this.people();
      if (!people.size) return;
      const run = ++this.layoutRun;
      layoutTree(people, this.tree.rootId).then(
        (layout) => run === this.layoutRun && this.layout.set(layout),
        () => this.loadError.set("Couldn't draw your family tree."),
      );
    });
    void this.load();
  }

  // Dragging from the screen edge pans the canvas instead of opening the side menu.
  ionViewWillEnter(): void {
    void this.menu.swipeGesture(false);
  }

  ionViewWillLeave(): void {
    void this.menu.swipeGesture(true);
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.tree.load();
    } catch {
      this.loadError.set("Couldn't load your family tree. Check your connection.");
    }
  }

  /** Puts the user's own card in the middle of the screen at 100 %. */
  center(): void {
    const { clientWidth, clientHeight } = this.canvas().nativeElement;
    this.view.set({ x: clientWidth / 2, y: clientHeight / 2, z: 1 });
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

  startEdit(person: Person): void {
    const name = (id: string) => this.people().get(id)?.name ?? 'Unknown';
    const rel = (ids: string[] | undefined, label: string) =>
      (ids ?? []).filter((id) => id !== person.id).map((id) => ({ id, name: name(id), label }));
    this.form.set({
      person,
      title: 'Edit details',
      relations: [
        ...rel(person.parents, 'Parent'),
        ...rel(person.spouses, 'Spouse'),
        ...rel(person.siblings, 'Sibling'),
        ...rel(person.children, 'Child'),
      ],
      canDelete: person.id !== this.tree.rootId,
      submit: (details) => this.tree.save(person.id, details),
    });
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
    const label = req.relation === 'sibling' ? `sibling (${req.before ? 'left' : 'right'})` : req.relation;
    this.form.set({
      person: { id: '', name: '' },
      title: `Add ${label} of ${of.name}`,
      relations: [],
      canDelete: false,
      submit: (details) => this.tree.add(of.id, req.relation, details, { before: req.before, otherParent }),
    });
  }

  async save(details: PersonDetails): Promise<void> {
    const form = this.form();
    if (!form) return;
    if (await this.run(() => form.submit(details))) this.closeForm();
  }

  async unlink(otherId: string): Promise<void> {
    const person = this.form()?.person;
    if (!person) return;
    const other = this.people().get(otherId)?.name ?? 'this person';
    if (!(await this.confirm(`Remove the relationship between ${person.name} and ${other}?`, 'Remove'))) return;
    if (await this.run(() => this.tree.unlink(person.id, otherId))) this.startEdit(this.people().get(person.id)!);
  }

  async remove(): Promise<void> {
    const person = this.form()?.person;
    if (!person) return;
    const others = this.tree
      .planDelete(person.id)
      .remove.filter((id) => id !== person.id)
      .map((id) => this.people().get(id)?.name);
    const message = others.length
      ? `This also deletes ${others.length === 1 ? '1 person' : `${others.length} people`} only connected through them: ${others.join(', ')}.`
      : 'This cannot be undone.';
    if (!(await this.confirm(`Delete ${person.name}? ${message}`, 'Delete'))) return;
    if (await this.run(() => this.tree.delete(person.id))) this.closeForm();
  }

  closeForm(): void {
    this.form.set(null);
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
