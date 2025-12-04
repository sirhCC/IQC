/**
 * Integration tests - End-to-end query execution
 */

import { Parser } from '../src/parser';
import { QueryExecutor } from '../src/engine';
import { PluginManager, MockPlugin } from '../src/plugins';

describe('Integration Tests', () => {
  let pluginManager: PluginManager;
  let executor: QueryExecutor;

  beforeEach(async () => {
    pluginManager = new PluginManager();
    await pluginManager.registerPlugin(new MockPlugin());
    executor = new QueryExecutor(pluginManager);
  });

  afterEach(async () => {
    await pluginManager.cleanup();
  });

  describe('End-to-end queries', () => {
    it('should execute simple SELECT query', async () => {
      const parser = new Parser('SELECT * FROM services');
      const query = parser.parse();
      const result = await executor.execute(query);

      expect(result).toHaveProperty('columns');
      expect(result).toHaveProperty('rows');
      expect((result as any).rows).toHaveLength(3);
    });

    it('should execute filtered SELECT query', async () => {
      const parser = new Parser("SELECT name, status FROM services WHERE environment = 'production'");
      const query = parser.parse();
      const result = await executor.execute(query);

      expect((result as any).rows).toHaveLength(2);
      expect((result as any).rows.every((r: any) => r.status)).toBe(true);
    });

    it('should execute query with ORDER BY', async () => {
      const parser = new Parser('SELECT name FROM services ORDER BY name ASC');
      const query = parser.parse();
      const result = await executor.execute(query);

      const names = (result as any).rows.map((r: any) => r.name);
      expect(names).toEqual(['api-gateway', 'auth-service', 'data-processor']);
    });

    it('should execute query with LIMIT', async () => {
      const parser = new Parser('SELECT * FROM services LIMIT 2');
      const query = parser.parse();
      const result = await executor.execute(query);

      expect((result as any).rows).toHaveLength(2);
    });

    it('should execute TRACE query', async () => {
      const parser = new Parser("TRACE service_id = 'svc-1' THROUGH mock");
      const query = parser.parse();
      const result = await executor.execute(query);

      expect(result).toHaveProperty('hops');
      expect((result as any).hops.length).toBeGreaterThan(0);
    });

    it('should execute DESCRIBE query', async () => {
      const parser = new Parser('DESCRIBE services');
      const query = parser.parse();
      const result = await executor.execute(query);

      expect(result).toHaveProperty('table');
      expect(result).toHaveProperty('columns');
      expect((result as any).table).toBe('services');
    });

    it('should execute SHOW TABLES', async () => {
      const parser = new Parser('SHOW TABLES');
      const query = parser.parse();
      const result = await executor.execute(query);

      expect(result).toHaveProperty('what');
      expect(result).toHaveProperty('items');
      expect((result as any).items.length).toBeGreaterThan(0);
    });

    it('should execute SHOW PLUGINS', async () => {
      const parser = new Parser('SHOW PLUGINS');
      const query = parser.parse();
      const result = await executor.execute(query);

      expect(result).toHaveProperty('what');
      expect(result).toHaveProperty('items');
      expect((result as any).items).toContainEqual(
        expect.objectContaining({ name: 'mock' })
      );
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-existent table', async () => {
      const parser = new Parser('SELECT * FROM nonexistent');
      const query = parser.parse();

      await expect(executor.execute(query)).rejects.toThrow();
    });

    it('should handle invalid WHERE conditions', async () => {
      const parser = new Parser("SELECT * FROM services WHERE invalid_column = 'value'");
      const query = parser.parse();
      const result = await executor.execute(query);

      // Should return empty results, not error
      expect((result as any).rows).toHaveLength(0);
    });
  });

  describe('Complex queries', () => {
    it('should handle multiple WHERE conditions with AND', async () => {
      const parser = new Parser(
        "SELECT * FROM services WHERE environment = 'production' AND status = 'active'"
      );
      const query = parser.parse();
      const result = await executor.execute(query);

      expect((result as any).rows).toHaveLength(2);
      expect((result as any).rows.every((r: any) => r.environment === 'production')).toBe(true);
      expect((result as any).rows.every((r: any) => r.status === 'active')).toBe(true);
    });

    it('should handle comparison operators', async () => {
      const parser = new Parser('SELECT * FROM services WHERE cpu_usage > 30');
      const query = parser.parse();
      const result = await executor.execute(query);

      expect((result as any).rows.length).toBeGreaterThan(0);
      expect((result as any).rows.every((r: any) => r.cpu_usage > 30)).toBe(true);
    });

    it('should handle ORDER BY DESC', async () => {
      const parser = new Parser('SELECT name, cpu_usage FROM services ORDER BY cpu_usage DESC');
      const query = parser.parse();
      const result = await executor.execute(query);

      const cpuValues = (result as any).rows.map((r: any) => r.cpu_usage);
      for (let i = 1; i < cpuValues.length; i++) {
        expect(cpuValues[i - 1]).toBeGreaterThanOrEqual(cpuValues[i]);
      }
    });

    it('should handle LIMIT with OFFSET', async () => {
      const parser = new Parser('SELECT * FROM services LIMIT 1 OFFSET 1');
      const query = parser.parse();
      const result = await executor.execute(query);

      expect((result as any).rows).toHaveLength(1);
      expect((result as any).totalCount).toBe(3);
    });

    it('should handle column aliases', async () => {
      const parser = new Parser('SELECT name AS service_name FROM services');
      const query = parser.parse();
      const result = await executor.execute(query);

      expect((result as any).columns[0].name).toBe('service_name');
      expect((result as any).rows[0]).toHaveProperty('service_name');
    });
  });
});
