/**
 * Plugin Manager tests
 */

import { PluginManager, MockPlugin } from '../src/plugins';

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  it('should register plugin', async () => {
    const plugin = new MockPlugin();
    await manager.registerPlugin(plugin);

    const plugins = manager.listPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('mock');
  });

  it('should throw error when registering duplicate plugin', async () => {
    const plugin1 = new MockPlugin();
    const plugin2 = new MockPlugin();

    await manager.registerPlugin(plugin1);
    await expect(manager.registerPlugin(plugin2)).rejects.toThrow('already registered');
  });

  it('should get plugin by name', async () => {
    const plugin = new MockPlugin();
    await manager.registerPlugin(plugin);

    const retrieved = manager.getPlugin('mock');
    expect(retrieved.name).toBe('mock');
  });

  it('should throw error for non-existent plugin', () => {
    expect(() => manager.getPlugin('nonexistent')).toThrow('not found');
  });

  it('should list all tables across plugins', async () => {
    const plugin = new MockPlugin();
    await manager.registerPlugin(plugin);

    const tables = await manager.getAllTables();
    expect(tables.length).toBeGreaterThan(0);
    expect(tables[0]).toHaveProperty('source');
  });

  it('should query through plugin', async () => {
    const plugin = new MockPlugin();
    await manager.registerPlugin(plugin);

    const result = await manager.query('mock', 'services', []);
    expect(result).toHaveProperty('rows');
    expect(result).toHaveProperty('columns');
  });

  it('should trace across plugins', async () => {
    const plugin = new MockPlugin();
    await manager.registerPlugin(plugin);

    const hops = await manager.trace('service_id', 'svc-1', ['mock']);
    expect(hops.length).toBeGreaterThan(0);
  });

  it('should perform health checks', async () => {
    const plugin = new MockPlugin();
    await manager.registerPlugin(plugin);

    const health = await manager.healthCheck();
    expect(health).toHaveProperty('mock');
    expect(health.mock.healthy).toBe(true);
  });

  it('should unregister plugin', async () => {
    const plugin = new MockPlugin();
    await manager.registerPlugin(plugin);

    await manager.unregisterPlugin('mock');
    const plugins = manager.listPlugins();
    expect(plugins).toHaveLength(0);
  });
});
