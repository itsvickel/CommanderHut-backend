import { describe, it, expect, beforeEach } from 'vitest';
import { createPreviewCache } from '../../../services/aiDeckBuilder/previewCache.js';

describe('previewCache', () => {
  let cache;
  beforeEach(() => { cache = createPreviewCache({ capacity: 3, ttlMs: 1000 }); });

  it('returns null for unknown id', () => {
    expect(cache.get('nope')).toBeNull();
  });

  it('stores and retrieves', () => {
    cache.set('a', { x: 1 });
    expect(cache.get('a')).toEqual({ x: 1 });
  });

  it('evicts oldest past capacity', () => {
    cache.set('a', 1); cache.set('b', 2); cache.set('c', 3); cache.set('d', 4);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('d')).toBe(4);
  });

  it('expires entries past TTL', async () => {
    const fast = createPreviewCache({ capacity: 3, ttlMs: 10 });
    fast.set('a', 1);
    await new Promise(r => setTimeout(r, 30));
    expect(fast.get('a')).toBeNull();
  });
});
