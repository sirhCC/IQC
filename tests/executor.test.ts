/**
 * Query Executor tests
 */

import { QueryExecutor } from '../src/engine';
import { PluginManager, MockPlugin } from '../src/plugins';
import { Query, SelectStatement } from '../src/types';

describe('QueryExecutor', () => {
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

  it('should execute SELECT query', async () => {
    const query: Query = {
      type: 'SELECT',
      statement: {
        columns: [{ name: '*' }],
        from: 'services',
      } as SelectStatement,
    };

    const result = await executor.execute(query);
    expect(result).toHaveProperty('rows');
    expect(result).toHaveProperty('columns');
  });

  it('should apply column selection', async () => {
    const query: Query = {
      type: 'SELECT',
      statement: {
        columns: [{ name: 'name' }, { name: 'status' }],
        from: 'services',
      } as SelectStatement,
    };

    const result = await executor.execute(query);
    expect((result as any).columns).toHaveLength(2);
  });

  it('should throw error for non-existent table', async () => {
    const query: Query = {
      type: 'SELECT',
      statement: {
        columns: [{ name: '*' }],
        from: 'nonexistent',
      } as SelectStatement,
    };

    await expect(executor.execute(query)).rejects.toThrow('not found');
  });
});
