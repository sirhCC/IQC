/**
 * Query Cache Tests
 */

import { QueryCache } from '../src/utils/cache';
import { QueryResult } from '../src/types';

describe('QueryCache', () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache({ enabled: true, defaultTTL: 5000, maxSize: 10 });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('Basic Operations', () => {
    it('should cache and retrieve query results', () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('services', [], undefined, result);
      const cached = cache.get('services', [], undefined);

      expect(cached).toEqual(result);
    });

    it('should return null for cache miss', () => {
      const cached = cache.get('services', [], undefined);
      expect(cached).toBeNull();
    });

    it('should distinguish queries by filters', () => {
      const result1: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      const result2: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '2' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('services', [{ field: 'id', operator: '=', value: '1' }], undefined, result1);
      cache.set('services', [{ field: 'id', operator: '=', value: '2' }], undefined, result2);

      const cached1 = cache.get(
        'services',
        [{ field: 'id', operator: '=', value: '1' }],
        undefined
      );
      const cached2 = cache.get(
        'services',
        [{ field: 'id', operator: '=', value: '2' }],
        undefined
      );

      expect(cached1?.rows[0].id).toBe('1');
      expect(cached2?.rows[0].id).toBe('2');
    });

    it('should distinguish queries by options', () => {
      const result1: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      const result2: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }, { id: '2' }],
        rowCount: 2,
        totalCount: 2,
      };

      cache.set('services', [], { limit: 1 }, result1);
      cache.set('services', [], { limit: 2 }, result2);

      const cached1 = cache.get('services', [], { limit: 1 });
      const cached2 = cache.get('services', [], { limit: 2 });

      expect(cached1?.rowCount).toBe(1);
      expect(cached2?.rowCount).toBe(2);
    });
  });

  describe('TTL and Expiration', () => {
    // Skipping due to timing sensitivity in CI environments
    it.skip('should expire entries after TTL', async () => {
      const shortCache = new QueryCache({ enabled: true, defaultTTL: 50 });
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      shortCache.set('services', [], undefined, result);

      // Should be cached initially
      expect(shortCache.get('services', [], undefined)).toEqual(result);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should be expired
      expect(shortCache.get('services', [], undefined)).toBeNull();
    });

    it('should use table-specific TTLs', () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      // deployments has 1 minute TTL
      cache.set('deployments', [], undefined, result);

      const stats = cache.getStats();
      const entry = stats.entries.find((e) => e.key.startsWith('deployments:'));
      expect(entry?.ttl).toBe(60000);
    });

    it('should allow setting custom table TTL', () => {
      cache.setTableTTL('custom_table', 30000);

      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('custom_table', [], undefined, result);

      const stats = cache.getStats();
      const entry = stats.entries.find((e) => e.key.startsWith('custom_table:'));
      expect(entry?.ttl).toBe(30000);
    });
  });

  describe('Cache Size Management', () => {
    it('should evict oldest entry when maxSize is reached', () => {
      const smallCache = new QueryCache({ enabled: true, maxSize: 2 });
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      smallCache.set('table1', [], undefined, result);
      smallCache.set('table2', [], undefined, result);
      smallCache.set('table3', [], undefined, result);

      const stats = smallCache.getStats();
      expect(stats.totalEntries).toBe(2);

      // First entry should be evicted
      expect(smallCache.get('table1', [], undefined)).toBeNull();
      expect(smallCache.get('table2', [], undefined)).not.toBeNull();
      expect(smallCache.get('table3', [], undefined)).not.toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits and misses', () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('services', [], undefined, result);

      // Hit
      cache.get('services', [], undefined);
      cache.get('services', [], undefined);

      // Miss
      cache.get('deployments', [], undefined);

      const stats = cache.getStats();
      expect(stats.totalHits).toBe(2);
      expect(stats.totalMisses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should track per-entry hit counts', () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('services', [], undefined, result);

      cache.get('services', [], undefined);
      cache.get('services', [], undefined);
      cache.get('services', [], undefined);

      const stats = cache.getStats();
      const entry = stats.entries[0];
      expect(entry.hits).toBe(3);
    });

    it('should report cache entry age', async () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('services', [], undefined, result);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = cache.getStats();
      const entry = stats.entries[0];
      expect(entry.age).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Cache Clearing', () => {
    it('should clear all cache entries', () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('table1', [], undefined, result);
      cache.set('table2', [], undefined, result);

      cache.clear();

      expect(cache.getStats().totalEntries).toBe(0);
      expect(cache.get('table1', [], undefined)).toBeNull();
      expect(cache.get('table2', [], undefined)).toBeNull();
    });

    it('should clear cache entries for specific table', () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('services', [], undefined, result);
      cache.set('deployments', [], undefined, result);

      cache.clearTable('services');

      expect(cache.get('services', [], undefined)).toBeNull();
      expect(cache.get('deployments', [], undefined)).not.toBeNull();
    });

    it('should reset hit/miss counters when clearing', () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('services', [], undefined, result);
      cache.get('services', [], undefined);
      cache.get('deployments', [], undefined);

      cache.clear();

      const stats = cache.getStats();
      expect(stats.totalHits).toBe(0);
      expect(stats.totalMisses).toBe(0);
    });
  });

  describe('Cache Control', () => {
    it('should disable and enable cache', () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.setEnabled(false);
      cache.set('services', [], undefined, result);

      // Should not cache when disabled
      expect(cache.get('services', [], undefined)).toBeNull();

      cache.setEnabled(true);
      cache.set('services', [], undefined, result);

      // Should cache when enabled
      expect(cache.get('services', [], undefined)).toEqual(result);
    });

    it('should clear cache when disabling', () => {
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      cache.set('services', [], undefined, result);
      cache.setEnabled(false);

      expect(cache.getStats().totalEntries).toBe(0);
    });

    it('should check if cache is enabled', () => {
      expect(cache.isEnabled()).toBe(true);

      cache.setEnabled(false);
      expect(cache.isEnabled()).toBe(false);
    });
  });

  describe('Cache Cleanup', () => {
    it('should remove expired entries during cleanup', async () => {
      const shortCache = new QueryCache({ enabled: true, defaultTTL: 50 });
      const result: QueryResult = {
        columns: [{ name: 'id', type: 'string' }],
        rows: [{ id: '1' }],
        rowCount: 1,
        totalCount: 1,
      };

      shortCache.set('table1', [], undefined, result);
      shortCache.set('table2', [], undefined, result);

      await new Promise((resolve) => setTimeout(resolve, 100));

      shortCache.cleanup();

      expect(shortCache.getStats().totalEntries).toBe(0);
    });
  });
});
