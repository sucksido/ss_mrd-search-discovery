import { describe, expect, it } from 'vitest';
import { TtlCache } from '../src/lib/cache.js';

describe('TtlCache', () => {
  it('returns a stored value before it expires', () => {
    let now = 1000;
    const cache = new TtlCache<string>(500, 10, () => now);
    cache.set('a', 'value');
    now = 1400;
    expect(cache.get('a')).toBe('value');
  });

  it('drops a value once the TTL has passed', () => {
    let now = 1000;
    const cache = new TtlCache<string>(500, 10, () => now);
    cache.set('a', 'value');
    now = 1500;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry at the size bound', () => {
    const cache = new TtlCache<number>(10_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');           // 'a' becomes the most recent
    cache.set('c', 3);        // evicts 'b'
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('counts hits and misses', () => {
    const cache = new TtlCache<number>(10_000, 10);
    cache.set('a', 1);
    cache.get('a');
    cache.get('missing');
    expect(cache.stats).toMatchObject({ hits: 1, misses: 1, size: 1 });
  });
});
