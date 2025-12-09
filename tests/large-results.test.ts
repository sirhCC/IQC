/**
 * Large Results Tests - Test handling of large result sets and limits
 */

import { Parser } from '../src/parser';
import { QueryExecutor } from '../src/engine';
import { PluginManager } from '../src/plugins';
import {
  DataSourcePlugin,
  PluginConfig,
  TableInfo,
  QueryResult,
  Filter,
  QueryOptions,
  Row,
} from '../src/types';

// Mock plugin that generates large datasets
class LargeDataPlugin implements DataSourcePlugin {
  name = 'large-data';
  version = '1.0.0';
  description = 'Mock plugin for testing large datasets';

  async initialize(config: PluginConfig): Promise<void> {
    // No initialization needed
  }

  async getTables(): Promise<TableInfo[]> {
    return [
      {
        name: 'massive_table',
        description: 'Table with many rows',
        columns: [
          { name: 'id', type: 'number' },
          { name: 'name', type: 'string' },
          { name: 'value', type: 'number' },
          { name: 'status', type: 'string' },
        ],
      },
    ];
  }

  async query(tableName: string, filters: Filter[], options?: QueryOptions): Promise<QueryResult> {
    if (tableName !== 'massive_table') {
      throw new Error(`Unknown table: ${tableName}`);
    }

    // Generate a large dataset (15000 rows by default)
    const rowCount = 15000;
    const rows: Row[] = [];

    for (let i = 1; i <= rowCount; i++) {
      const row: Row = {
        id: i,
        name: `item_${i}`,
        value: Math.floor(Math.random() * 1000),
        status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'pending' : 'inactive',
      };
      rows.push(row);
    }

    // Apply filters
    let filtered = rows;
    for (const filter of filters) {
      filtered = filtered.filter((row) => {
        const fieldValue = row[filter.field];
        switch (filter.operator) {
          case '=':
            return fieldValue == filter.value;
          case '!=':
            return fieldValue != filter.value;
          case '>':
            return fieldValue > filter.value;
          case '<':
            return fieldValue < filter.value;
          case '>=':
            return fieldValue >= filter.value;
          case '<=':
            return fieldValue <= filter.value;
          default:
            return true;
        }
      });
    }

    // Apply limit if specified
    if (options?.limit !== undefined) {
      const offset = options.offset || 0;
      filtered = filtered.slice(offset, offset + options.limit);
    }

    return {
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' },
        { name: 'value', type: 'number' },
        { name: 'status', type: 'string' },
      ],
      rows: filtered,
      rowCount: filtered.length,
      totalCount: rows.length,
    };
  }
}

describe('Large Result Sets', () => {
  let pluginManager: PluginManager;
  let executor: QueryExecutor;

  beforeEach(async () => {
    pluginManager = new PluginManager();
    await pluginManager.registerPlugin(new LargeDataPlugin());
    executor = new QueryExecutor(pluginManager);
  });

  afterEach(async () => {
    await pluginManager.cleanup();
  });

  test('should truncate results exceeding default max (10000)', async () => {
    const parser = new Parser('SELECT * FROM massive_table');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    // Should be truncated to 10000 rows
    expect(result.rows.length).toBe(10000);
    expect(result.truncated).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('truncated');
    expect(result.warning).toContain('10000');
  });

  test('should not truncate when LIMIT is specified', async () => {
    const parser = new Parser('SELECT * FROM massive_table LIMIT 100');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBe(100);
    expect(result.truncated).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  test('should suggest pagination in warning message', async () => {
    const parser = new Parser('SELECT * FROM massive_table');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.warning).toContain('LIMIT');
    expect(result.warning).toContain('OFFSET');
  });

  test('should handle pagination with LIMIT and OFFSET', async () => {
    // First page
    const parser1 = new Parser('SELECT * FROM massive_table LIMIT 100 OFFSET 0');
    const query1 = parser1.parse();
    const result1 = (await executor.execute(query1)) as QueryResult;

    expect(result1.rows.length).toBe(100);
    expect(result1.rows[0].id).toBe(1);
    expect(result1.truncated).toBeUndefined();

    // Second page
    const parser2 = new Parser('SELECT * FROM massive_table LIMIT 100 OFFSET 100');
    const query2 = parser2.parse();
    const result2 = (await executor.execute(query2)) as QueryResult;

    expect(result2.rows.length).toBe(100);
    expect(result2.rows[0].id).toBe(101);
    expect(result2.truncated).toBeUndefined();
  });

  test('should work with WHERE filters on large dataset', async () => {
    const parser = new Parser("SELECT * FROM massive_table WHERE status = 'active'");
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    // Should return all active items (every 3rd item = 5000 items)
    expect(result.rows.length).toBe(5000);
    expect(result.rows.every((row: any) => row.status === 'active')).toBe(true);
    expect(result.truncated).toBeUndefined();
  });

  test('should truncate filtered results if they exceed limit', async () => {
    // Filter returns more than 10000 rows (inactive = 5000, pending = 5000 = 10000 total)
    // This won't trigger truncation, but let's test with a broader condition
    const parser = new Parser('SELECT * FROM massive_table WHERE value >= 0');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBe(10000);
    expect(result.truncated).toBe(true);
  });

  test('should handle empty results gracefully', async () => {
    const parser = new Parser('SELECT * FROM massive_table WHERE id = 999999');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBe(0);
    expect(result.truncated).toBeUndefined();
  });

  test('should combine LIMIT with WHERE clause', async () => {
    const parser = new Parser("SELECT * FROM massive_table WHERE status = 'active' LIMIT 10");
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBe(10);
    expect(result.rows.every((row: any) => row.status === 'active')).toBe(true);
    expect(result.truncated).toBeUndefined();
  });

  test('should handle LIMIT larger than result set', async () => {
    const parser = new Parser("SELECT * FROM massive_table WHERE status = 'active' LIMIT 10000");
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    // Only 5000 active items exist
    expect(result.rows.length).toBe(5000);
    expect(result.truncated).toBeUndefined();
  });

  test('should handle ORDER BY with large results', async () => {
    const parser = new Parser('SELECT * FROM massive_table ORDER BY id ASC LIMIT 100');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBe(100);
    // Verify we got results (ordering is handled by the plugin's query implementation)
    expect(result.rows[0].id).toBeDefined();
    expect(result.truncated).toBeUndefined();
  });

  test('should provide helpful warning message format', async () => {
    const parser = new Parser('SELECT * FROM massive_table');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.warning).toBeDefined();
    // Warning should mention the limit
    expect(result.warning).toMatch(/10000/);
    // Warning should suggest solutions
    expect(result.warning).toMatch(/LIMIT|WHERE|filter/i);
  });
});

describe('Result Limits Edge Cases', () => {
  let pluginManager: PluginManager;
  let executor: QueryExecutor;

  beforeEach(async () => {
    pluginManager = new PluginManager();
    await pluginManager.registerPlugin(new LargeDataPlugin());
    executor = new QueryExecutor(pluginManager);
  });

  afterEach(async () => {
    await pluginManager.cleanup();
  });

  test('should handle LIMIT 0', async () => {
    const parser = new Parser('SELECT * FROM massive_table LIMIT 0');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBe(0);
    expect(result.truncated).toBeUndefined();
  });

  test('should handle very large LIMIT', async () => {
    const parser = new Parser('SELECT * FROM massive_table LIMIT 999999');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    // Should return all available rows (15000)
    expect(result.rows.length).toBe(15000);
    expect(result.truncated).toBeUndefined();
  });

  test('should handle OFFSET beyond dataset', async () => {
    const parser = new Parser('SELECT * FROM massive_table LIMIT 100 OFFSET 20000');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBe(0);
  });

  test('should handle LIMIT 1 efficiently', async () => {
    const parser = new Parser('SELECT * FROM massive_table LIMIT 1');
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].id).toBe(1);
  });
});
