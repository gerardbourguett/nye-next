/**
 * Remembers an async result per key for a short time and shares one in-flight
 * call between simultaneous callers, so a burst of visitors on a warm server
 * instance costs one read instead of one each. Failures are not remembered:
 * the next caller tries again. The clock is injectable for tests.
 */
export function ttlCache<K, V>(load: (key: K) => Promise<V>, ttlMs: number, now: () => number = Date.now, maxEntries = 16) {
  const entries = new Map<K, { value: Promise<V>; expires: number }>();
  return (key: K): Promise<V> => {
    const current = entries.get(key);
    if (current && current.expires > now()) return current.value;
    const value = load(key);
    entries.set(key, { value, expires: now() + ttlMs });
    value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key); });
    for (const stale of entries.keys()) {
      if (entries.size <= maxEntries) break;
      entries.delete(stale);
    }
    return value;
  };
}
