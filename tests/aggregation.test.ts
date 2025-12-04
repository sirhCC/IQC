import { describe, expect, test, beforeEach } from '@jest/globals';
import { QueryExecutor } from '../src/engine/executor';
import { PluginManager } from '../src/plugins/plugin-manager';
import { MockPlugin } from '../src/plugins/mock-plugin';
import { Parser } from '../src/parser/parser';

describe('Aggregation Functions', () => {
  let executor: QueryExecutor;
  let pluginManager: PluginManager;

  beforeEach(async () => {
    pluginManager = new PluginManager();
    await pluginManager.registerPlugin(new MockPlugin());
    executor = new QueryExecutor(pluginManager);
  });

  test('COUNT(*) without GROUP BY', async () => {
    const parser = new Parser('SELECT COUNT(*) as total FROM services');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows).toHaveLength(1);
    expect((result as any).rows[0].total).toBe(3);
  });

  test('COUNT(column) without GROUP BY', async () => {
    const parser = new Parser('SELECT COUNT(name) as name_count FROM services');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows).toHaveLength(1);
    expect((result as any).rows[0].name_count).toBe(3);
  });

  test('SUM aggregate', async () => {
    const parser = new Parser('SELECT SUM(replicas) as total_replicas FROM deployments');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows).toHaveLength(1);
    expect((result as any).rows[0].total_replicas).toBe(6); // 2 + 3 + 1
  });

  test('AVG aggregate', async () => {
    const parser = new Parser('SELECT AVG(replicas) as avg_replicas FROM deployments');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows).toHaveLength(1);
    expect((result as any).rows[0].avg_replicas).toBe(2); // (2 + 3 + 1) / 3
  });

  test('MIN aggregate', async () => {
    const parser = new Parser('SELECT MIN(replicas) as min_replicas FROM deployments');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows).toHaveLength(1);
    expect((result as any).rows[0].min_replicas).toBe(1);
  });

  test('MAX aggregate', async () => {
    const parser = new Parser('SELECT MAX(replicas) as max_replicas FROM deployments');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows).toHaveLength(1);
    expect((result as any).rows[0].max_replicas).toBe(3);
  });

  test('Multiple aggregates without GROUP BY', async () => {
    const parser = new Parser('SELECT COUNT(*) as total, SUM(replicas) as sum_rep, AVG(replicas) as avg_rep FROM deployments');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows).toHaveLength(1);
    expect((result as any).rows[0].total).toBe(3);
    expect((result as any).rows[0].sum_rep).toBe(6);
    expect((result as any).rows[0].avg_rep).toBe(2);
  });

  test('GROUP BY single field', async () => {
    const parser = new Parser('SELECT status, COUNT(*) as count FROM services GROUP BY status');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows).toHaveLength(2); // active and degraded
    
    const activeRow = (result as any).rows.find((r: any) => r.status === 'active');
    const degradedRow = (result as any).rows.find((r: any) => r.status === 'degraded');
    
    expect(activeRow.count).toBe(2);
    expect(degradedRow.count).toBe(1);
  });

  test('GROUP BY with SUM', async () => {
    const parser = new Parser('SELECT environment, SUM(replicas) as total FROM deployments GROUP BY environment');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows.length).toBeGreaterThan(0);
    
    // Check that each row has environment and total
    for (const row of (result as any).rows) {
      expect(row).toHaveProperty('environment');
      expect(row).toHaveProperty('total');
      expect(typeof row.total).toBe('number');
    }
  });

  test('GROUP BY with multiple aggregates', async () => {
    const parser = new Parser('SELECT status, COUNT(*) as cnt, MAX(replicas) as max_rep FROM deployments GROUP BY status');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows.length).toBeGreaterThan(0);
    
    for (const row of (result as any).rows) {
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('cnt');
      expect(row).toHaveProperty('max_rep');
    }
  });

  test('HAVING clause with COUNT', async () => {
    const parser = new Parser('SELECT status, COUNT(*) as count FROM services GROUP BY status HAVING count > 1');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    
    // All returned rows should have count > 1
    for (const row of (result as any).rows) {
      expect(row.count).toBeGreaterThan(1);
    }
  });

  test('GROUP BY with ORDER BY aggregate', async () => {
    const parser = new Parser('SELECT status, COUNT(*) as cnt FROM services GROUP BY status ORDER BY cnt DESC');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows.length).toBeGreaterThan(0);
    
    // Verify ordering (descending by count)
    const counts = (result as any).rows.map((r: any) => r.cnt);
    for (let i = 0; i < counts.length - 1; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
    }
  });

  test('Aggregate with WHERE clause', async () => {
    const parser = new Parser('SELECT COUNT(*) as count FROM services WHERE status = active');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    expect((result as any).rows).toHaveLength(1);
    expect((result as any).rows[0].count).toBe(2);
  });

  test('GROUP BY multiple fields', async () => {
    const parser = new Parser('SELECT environment, status, COUNT(*) as count FROM deployments GROUP BY environment, status');
    const query = parser.parse();
    const result = await executor.execute(query);

    expect(result).toHaveProperty('rows');
    
    for (const row of (result as any).rows) {
      expect(row).toHaveProperty('environment');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('count');
    }
  });
});
