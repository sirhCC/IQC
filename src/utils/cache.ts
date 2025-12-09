/**
 * Query Cache - In-memory cache with TTL support for query results
 */

import { QueryResult } from '../types';
import { logger } from './logger';

export interface CacheEntry {
  result: QueryResult;
  timestamp: number;
  ttl: number;
  hits: number;
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  entries: Array<{
    key: string;
    size: number;
    hits: number;
    age: number;
    ttl: number;
  }>;
}

export interface QueryCacheOptions {
  enabled?: boolean;
  defaultTTL?: number;
  maxSize?: number;
  tableTTLs?: Record<string, number>;
}

export class QueryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private enabled: boolean = true;
  private defaultTTL: number = 300000; // 5 minutes in ms
  private maxSize: number = 100;
  private tableTTLs: Record<string, number> = {
    // Fast-changing data: 1 minute
    deployments: 60000,
    incidents: 60000,
    // Medium-changing data: 5 minutes (default)
    services: 300000,
    pods: 300000,
    containers: 300000,
    // Slow-changing data: 1 hour
    ec2_instances: 3600000,
    rds_instances: 3600000,
    lambda_functions: 3600000,
    k8s_nodes: 3600000,
    docker_images: 3600000,
  };

  constructor(options?: QueryCacheOptions) {
    if (options) {
      this.enabled = options.enabled ?? true;
      this.defaultTTL = options.defaultTTL ?? this.defaultTTL;
      this.maxSize = options.maxSize ?? this.maxSize;
      if (options.tableTTLs) {
        this.tableTTLs = { ...this.tableTTLs, ...options.tableTTLs };
      }
    }
  }

  /**
   * Generate cache key from query components
   */
  private generateKey(table: string, filters: any[], options?: any): string {
    const filterStr = JSON.stringify(filters);
    const optionsStr = JSON.stringify(options || {});
    // Include columns in cache key to distinguish different column selections
    const columnsStr = options?.columns ? JSON.stringify(options.columns) : '*';
    return `${table}:${columnsStr}:${filterStr}:${optionsStr}`;
  }

  /**
   * Get TTL for specific table
   */
  private getTTL(table: string): number {
    return this.tableTTLs[table] || this.defaultTTL;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    return now - entry.timestamp > entry.ttl;
  }

  /**
   * Get cached query result
   */
  get(table: string, filters: any[], options?: any): QueryResult | null {
    if (!this.enabled) {
      return null;
    }

    const key = this.generateKey(table, filters, options);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.misses++;
      logger.debug('Cache entry expired', { table, key });
      return null;
    }

    entry.hits++;
    this.hits++;
    logger.debug('Cache hit', { table, key, hits: entry.hits });
    return entry.result;
  }

  /**
   * Set cache entry
   */
  set(table: string, filters: any[], options: any | undefined, result: QueryResult): void {
    if (!this.enabled) {
      return;
    }

    // Check cache size limit
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const key = this.generateKey(table, filters, options);
    const ttl = this.getTTL(table);

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      ttl,
      hits: 0,
    });

    logger.debug('Cache set', { table, key, ttl: `${ttl}ms` });
  }

  /**
   * Evict oldest cache entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug('Cache evicted', { key: oldestKey });
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    logger.info('Cache cleared', { entriesCleared: size });
  }

  /**
   * Clear cache entries for specific table
   */
  clearTable(table: string): void {
    let cleared = 0;
    for (const [key] of this.cache.entries()) {
      if (key.startsWith(`${table}:`)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    logger.info('Cache cleared for table', { table, entriesCleared: cleared });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;
    const now = Date.now();

    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      size: JSON.stringify(entry.result).length,
      hits: entry.hits,
      age: now - entry.timestamp,
      ttl: entry.ttl,
    }));

    return {
      totalEntries: this.cache.size,
      totalHits: this.hits,
      totalMisses: this.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      entries,
    };
  }

  /**
   * Set default TTL
   */
  setDefaultTTL(ttl: number): void {
    this.defaultTTL = ttl;
    logger.info('Default cache TTL updated', { ttl: `${ttl}ms` });
  }

  /**
   * Set TTL for specific table
   */
  setTableTTL(table: string, ttl: number): void {
    this.tableTTLs[table] = ttl;
    logger.info('Cache TTL updated for table', { table, ttl: `${ttl}ms` });
  }

  /**
   * Enable/disable cache
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
    logger.info('Cache enabled state changed', { enabled });
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug('Cache cleanup completed', { entriesRemoved: cleaned });
    }
  }
}

// Global cache instance
export const queryCache = new QueryCache();
