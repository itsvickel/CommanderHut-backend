export function createPreviewCache({ capacity = 500, ttlMs = 60 * 60 * 1000 } = {}) {
  const map = new Map(); // key -> { value, expiresAt }

  function evictExpired() {
    const now = Date.now();
    for (const [k, { expiresAt }] of map) {
      if (expiresAt <= now) map.delete(k);
    }
  }

  return {
    get(key) {
      evictExpired();
      const entry = map.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) { map.delete(key); return null; }
      // touch for LRU
      map.delete(key); map.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      evictExpired();
      if (map.has(key)) map.delete(key);
      map.set(key, { value, expiresAt: Date.now() + ttlMs });
      while (map.size > capacity) {
        const firstKey = map.keys().next().value;
        map.delete(firstKey);
      }
    },
    delete(key) { map.delete(key); },
  };
}
