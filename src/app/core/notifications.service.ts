import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';

import { AuthService } from './auth.service';
import { FIRESTORE } from './firebase';

export type NotificationStatus = 'pending' | 'approved' | 'rejected';

/**
 * notifications/{id}. Today only one kind, for all admins: a new account
 * (id = its uid) waiting for approval. See firestore.rules.
 */
export interface AppNotification {
  id: string;
  type: 'account-approval';
  userId: string;
  email: string;
  displayName: string;
  status: NotificationStatus;
  /** Admins who opened it. */
  readBy: string[];
  actedBy?: string;
  actedAt?: Timestamp;
  createdAt?: Timestamp;
}

/** The signed-in admin's notifications, live. Other users have none yet. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  /** Newest first. ponytail: the latest 50; add paging when that is not enough. */
  readonly items = signal<AppNotification[]>([]);
  /** Highlighted and counted on the bell: still waiting, and not opened by this admin. */
  readonly unread = computed(() => this.items().filter((n) => this.isNew(n)).length);

  constructor() {
    effect((onCleanup) => {
      if (!this.auth.isAdmin()) {
        this.items.set([]);
        return;
      }
      const stop = onSnapshot(
        query(
          collection(this.db, 'notifications'),
          where('audience', '==', 'admins'),
          orderBy('createdAt', 'desc'),
          limit(50),
        ),
        (snap) => this.items.set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification)),
        () => this.items.set([]),
      );
      onCleanup(stop);
    });
  }

  /** Waiting for action and not opened by this admin yet. Once any admin acts, it is no longer new for anyone. */
  isNew(n: AppNotification): boolean {
    return n.status === 'pending' && !n.readBy.includes(this.me());
  }

  /** Opened: no longer highlighted for this admin (it stays in the list). */
  async markRead(n: AppNotification): Promise<void> {
    if (n.readBy.includes(this.me())) return;
    await updateDoc(doc(this.db, 'notifications', n.id), { readBy: arrayUnion(this.me()) });
  }

  /** Approves (activates the account) or rejects (it stays inactive) a new account, once. */
  async decide(n: AppNotification, approve: boolean): Promise<void> {
    const batch = writeBatch(this.db);
    if (approve) batch.update(doc(this.db, 'users', n.userId), { active: true });
    batch.update(doc(this.db, 'notifications', n.id), this.acted(approve ? 'approved' : 'rejected'));
    await batch.commit();
  }

  /** Activates a user (Users page), also resolving their pending approval request, if any. */
  async activate(userId: string): Promise<void> {
    const ref = doc(this.db, 'notifications', userId);
    const request = await getDoc(ref);
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'users', userId), { active: true });
    if (request.exists() && request.data()['status'] === 'pending') batch.update(ref, this.acted('approved'));
    await batch.commit();
  }

  private acted(status: NotificationStatus) {
    return { status, actedBy: this.me(), actedAt: serverTimestamp(), readBy: arrayUnion(this.me()) };
  }

  private me(): string {
    return this.auth.profile()?.id ?? '';
  }
}
