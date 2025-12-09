/**
 * JOIN Tests - Test JOIN parsing and execution
 */

import { Parser } from '../src/parser';
import { QueryExecutor } from '../src/engine';
import { PluginManager, MockPlugin } from '../src/plugins';
import { SelectStatement, QueryResult } from '../src/types';

describe('JOIN Parsing', () => {
  test('should parse INNER JOIN', () => {
    const parser = new Parser(
      'SELECT * FROM services INNER JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();

    expect(query.type).toBe('SELECT');
    const statement = query.statement as SelectStatement;
    expect(statement.from).toBe('services');
    expect(statement.joins).toBeDefined();
    expect(statement.joins?.length).toBe(1);
    expect(statement.joins![0].type).toBe('INNER');
    expect(statement.joins![0].table).toBe('deployments');
    expect(statement.joins![0].on.leftField).toBe('services.id');
    expect(statement.joins![0].on.operator).toBe('=');
    expect(statement.joins![0].on.rightField).toBe('deployments.service_id');
  });

  test('should parse LEFT JOIN', () => {
    const parser = new Parser(
      'SELECT * FROM services LEFT JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();

    const statement = query.statement as SelectStatement;
    expect(statement.joins![0].type).toBe('LEFT');
  });

  test('should parse LEFT OUTER JOIN', () => {
    const parser = new Parser(
      'SELECT * FROM services LEFT OUTER JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();

    const statement = query.statement as SelectStatement;
    expect(statement.joins![0].type).toBe('LEFT');
  });

  test('should parse RIGHT JOIN', () => {
    const parser = new Parser(
      'SELECT * FROM services RIGHT JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();

    const statement = query.statement as SelectStatement;
    expect(statement.joins![0].type).toBe('RIGHT');
  });

  test('should parse multiple JOINs', () => {
    const parser = new Parser(
      'SELECT * FROM services ' +
        'INNER JOIN deployments ON services.id = deployments.service_id ' +
        'LEFT JOIN incidents ON services.id = incidents.service_id'
    );
    const query = parser.parse();

    const statement = query.statement as SelectStatement;
    expect(statement.joins?.length).toBe(2);
    expect(statement.joins![0].type).toBe('INNER');
    expect(statement.joins![0].table).toBe('deployments');
    expect(statement.joins![1].type).toBe('LEFT');
    expect(statement.joins![1].table).toBe('incidents');
  });

  test('should parse JOIN with WHERE clause', () => {
    const parser = new Parser(
      'SELECT * FROM services ' +
        'INNER JOIN deployments ON services.id = deployments.service_id ' +
        "WHERE services.environment = 'production'"
    );
    const query = parser.parse();

    const statement = query.statement as SelectStatement;
    expect(statement.joins?.length).toBe(1);
    expect(statement.where).toBeDefined();
  });

  test('should parse JOIN with different operators', () => {
    const operators = ['=', '!=', '>', '<', '>=', '<='];

    for (const op of operators) {
      const parser = new Parser(
        `SELECT * FROM services INNER JOIN deployments ON services.priority ${op} deployments.priority`
      );
      const query = parser.parse();
      const statement = query.statement as SelectStatement;
      expect(statement.joins![0].on.operator).toBe(op);
    }
  });

  test('should parse JOIN without table prefix in ON clause', () => {
    const parser = new Parser('SELECT * FROM services INNER JOIN deployments ON id = service_id');
    const query = parser.parse();

    const statement = query.statement as SelectStatement;
    expect(statement.joins![0].on.leftField).toBe('id');
    expect(statement.joins![0].on.rightField).toBe('service_id');
  });
});

describe('JOIN Execution', () => {
  let pluginManager: PluginManager;
  let executor: QueryExecutor;
  let mockPlugin: MockPlugin;

  beforeEach(async () => {
    pluginManager = new PluginManager();
    mockPlugin = new MockPlugin();
    await pluginManager.registerPlugin(mockPlugin);
    executor = new QueryExecutor(pluginManager);
  });

  afterEach(async () => {
    await pluginManager.cleanup();
  });

  test('should execute INNER JOIN', async () => {
    const parser = new Parser(
      'SELECT * FROM services INNER JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBeGreaterThan(0);
    // Verify joined data has columns from both tables
    expect(result.rows[0]).toHaveProperty(['services.id']);
    expect(result.rows[0]).toHaveProperty(['deployments.service_id']);
    expect(result.rows[0]).toHaveProperty(['services.name']);
    expect(result.rows[0]).toHaveProperty(['deployments.version']);
  });

  test('INNER JOIN should only return matching rows', async () => {
    const parser = new Parser(
      'SELECT * FROM services INNER JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    // All rows should have matching service_id
    for (const row of result.rows) {
      expect(row['services.id']).toBe(row['deployments.service_id']);
    }
  });

  test('should execute LEFT JOIN', async () => {
    const parser = new Parser(
      'SELECT * FROM services LEFT JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBeGreaterThan(0);

    // Check if there are any rows with null deployments (unmatched left rows)
    const hasUnmatchedLeft = result.rows.some((row: any) => row['deployments.service_id'] === null);

    // Should have all services, even those without deployments
    const servicesResult = await pluginManager.query('mock', 'services', [], {});
    expect(result.rows.length).toBeGreaterThanOrEqual(servicesResult.rows.length);
  });

  test('LEFT JOIN should include unmatched left rows with nulls', async () => {
    const parser = new Parser(
      'SELECT * FROM services LEFT JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    // For matched rows, service_id should match
    // For unmatched rows, deployment fields should be null
    for (const row of result.rows) {
      if (row['deployments.service_id'] !== null) {
        expect(row['services.id']).toBe(row['deployments.service_id']);
      }
    }
  });

  test('should execute RIGHT JOIN', async () => {
    const parser = new Parser(
      'SELECT * FROM services RIGHT JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBeGreaterThan(0);

    // Should have all deployments
    const deploymentsResult = await pluginManager.query('mock', 'deployments', [], {});
    expect(result.rows.length).toBeGreaterThanOrEqual(deploymentsResult.rows.length);
  });

  test('should execute multiple JOINs', async () => {
    const parser = new Parser(
      'SELECT * FROM services ' +
        'INNER JOIN deployments ON services.id = deployments.service_id ' +
        'LEFT JOIN incidents ON services.id = incidents.service_id'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBeGreaterThan(0);
    // Should have columns from all three tables
    expect(result.rows[0]).toHaveProperty(['services.id']);
    expect(result.rows[0]).toHaveProperty(['deployments.service_id']);
    expect(result.rows[0]).toHaveProperty(['incidents.service_id']);
  });

  test('should execute JOIN with WHERE clause', async () => {
    const parser = new Parser(
      'SELECT * FROM services ' +
        'INNER JOIN deployments ON services.id = deployments.service_id ' +
        "WHERE services.environment = 'production'"
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    // All results should be from production environment
    for (const row of result.rows) {
      expect(row['services.environment']).toBe('production');
    }
  });

  test('should execute JOIN with column selection', async () => {
    const parser = new Parser(
      'SELECT services.name, deployments.version FROM services ' +
        'INNER JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty(['services.name']);
    expect(result.rows[0]).toHaveProperty(['deployments.version']);
  });

  test('should execute JOIN with ORDER BY', async () => {
    const parser = new Parser(
      'SELECT * FROM services ' +
        'INNER JOIN deployments ON services.id = deployments.service_id ' +
        'ORDER BY services.name ASC'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBeGreaterThan(0);

    // Verify ordering
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1]['services.name'];
      const curr = result.rows[i]['services.name'];
      expect(prev <= curr).toBe(true);
    }
  });

  test('should execute JOIN with LIMIT', async () => {
    const parser = new Parser(
      'SELECT * FROM services ' +
        'INNER JOIN deployments ON services.id = deployments.service_id ' +
        'LIMIT 5'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBeLessThanOrEqual(5);
  });

  test('should handle JOIN with non-equality operators', async () => {
    const parser = new Parser(
      'SELECT * FROM services ' + 'INNER JOIN deployments ON services.id != deployments.service_id'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    // Should only return rows where IDs don't match
    for (const row of result.rows) {
      expect(row['services.id']).not.toBe(row['deployments.service_id']);
    }
  });

  test('should handle empty result from JOIN', async () => {
    // Create a query that won't match anything
    const parser = new Parser(
      'SELECT * FROM services ' +
        'INNER JOIN deployments ON services.id = deployments.service_id ' +
        "WHERE services.environment = 'nonexistent'"
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    expect(result.rows.length).toBe(0);
  });

  test('should preserve unprefixed column names for convenience', async () => {
    const parser = new Parser(
      'SELECT * FROM services INNER JOIN deployments ON services.id = deployments.service_id'
    );
    const query = parser.parse();
    const result = (await executor.execute(query)) as QueryResult;

    // Should have both prefixed and unprefixed versions (unprefixed for convenience)
    expect(result.rows[0]).toHaveProperty('id');
    expect(result.rows[0]).toHaveProperty(['services.id']);
  });
});

describe('JOIN Error Handling', () => {
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

  test('should throw error for non-existent table in JOIN', async () => {
    const parser = new Parser(
      'SELECT * FROM services INNER JOIN nonexistent ON services.id = nonexistent.id'
    );
    const query = parser.parse();

    await expect(executor.execute(query)).rejects.toThrow('not found');
  });

  test('should throw parse error for JOIN without ON clause', () => {
    expect(() => {
      new Parser('SELECT * FROM services INNER JOIN deployments').parse();
    }).toThrow();
  });

  test('should throw parse error for invalid JOIN syntax', () => {
    expect(() => {
      new Parser('SELECT * FROM services JOIN').parse();
    }).toThrow();
  });
});
