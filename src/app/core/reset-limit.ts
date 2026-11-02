/**
 * At most 2 password-reset emails per address per day from this device, to
 * protect the Spark plan's daily email quota.
 *
 * ponytail: device storage only (as agreed); clearing site data or another
 * device bypasses it. A server-side limit needs a backend (paid plan).
 */
export const RESET_LINKS_PER_DAY = 2;
const KEY = 'generations.resetLinks';

type Store = { day: string; counts: Record<string, number> };

const today = () => new Date().toISOString().slice(0, 10);

function load(): Store {
  try {
    const store = JSON.parse(localStorage.getItem(KEY) ?? '') as Store;
    if (store.day === today()) return store;
  } catch {
    // missing or unreadable: start fresh
  }
  return { day: today(), counts: {} };
}

/** Reset links still allowed today for this email on this device. */
export function resetLinksLeft(email: string): number {
  return Math.max(0, RESET_LINKS_PER_DAY - (load().counts[email.trim().toLowerCase()] ?? 0));
}

export function recordResetLink(email: string): void {
  const store = load();
  const key = email.trim().toLowerCase();
  store.counts[key] = (store.counts[key] ?? 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage unavailable: the limit cannot be kept on this device
  }
}
