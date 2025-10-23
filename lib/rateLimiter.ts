const windowMs = 60 * 1000;
const maxRequestsPerWindow = 8;

type RecordEntry = {
  count: number;
  expiresAt: number;
};

const store = new Map<string, RecordEntry>();

export function canProceed(key: string): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.expiresAt < now) {
    store.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequestsPerWindow) {
    return false;
  }
  entry.count += 1;
  store.set(key, entry);
  return true;
}
