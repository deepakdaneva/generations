import { Component, afterNextRender, computed, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonSpinner, IonText, MenuController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, locateOutline, remove } from 'ionicons/icons';

import { TopActionsComponent } from '../shared/top-actions.component';
import { PersonCardComponent } from '../tree/person-card.component';
import { PersonEditComponent } from '../tree/person-edit.component';
import { TreeService, type Person, type PersonDetails } from '../tree/tree.service';
import { zoomAt, type View } from '../tree/view';

type Point = { x: number; y: number };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

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
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  protected readonly view = signal<View>({ x: 0, y: 0, z: 1 });
  protected readonly dragging = signal(false);
  private readonly rootId = signal<string | null>(null);
  protected readonly root = computed(() => this.tree.people().get(this.rootId() ?? '') ?? null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly editing = signal<Person | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  /** Active pointers (mouse or fingers) on the empty canvas, in client coordinates. */
  private readonly pointers = new Map<number, Point>();

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
      this.rootId.set((await this.tree.loadRoot()).id);
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

  async save(details: PersonDetails): Promise<void> {
    const person = this.editing();
    if (!person) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.tree.save(person.id, details);
      this.editing.set(null);
    } catch {
      this.saveError.set("Couldn't save. Check your connection and try again.");
    } finally {
      this.saving.set(false);
    }
  }

  closeEdit(): void {
    this.editing.set(null);
    this.saveError.set(null);
  }
}
