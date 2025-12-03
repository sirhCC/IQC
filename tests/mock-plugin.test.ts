import { MockPlugin } from '../src/plugins/mock-plugin';

describe('MockPlugin', () => {
  let plugin: MockPlugin;
  
  beforeEach(async () => {
    plugin = new MockPlugin();
    await plugin.initialize({});
  });
  
  it('should return available tables', async () => {
    const tables = await plugin.getTables();
    
    expect(tables).toHaveLength(3);
    expect(tables.map(t => t.name)).toEqual(['services', 'deployments', 'incidents']);
  });
  
  it('should query services table', async () => {
    const result = await plugin.query('services', []);
    
    expect(result.rows).toHaveLength(3);
    expect(result.columns).toBeDefined();
    expect(result.rowCount).toBe(3);
  });
  
  it('should filter by equality', async () => {
    const result = await plugin.query('services', [
      { field: 'environment', operator: '=', value: 'production' }
    ]);
    
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every(r => r.environment === 'production')).toBe(true);
  });
  
  it('should filter by comparison', async () => {
    const result = await plugin.query('services', [
      { field: 'cpu_usage', operator: '>', value: 30 }
    ]);
    
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('api-gateway');
  });
  
  it('should apply sorting', async () => {
    const result = await plugin.query('services', [], {
      orderBy: [{ field: 'name', direction: 'ASC' }]
    });
    
    expect(result.rows[0].name).toBe('api-gateway');
    expect(result.rows[1].name).toBe('auth-service');
  });
  
  it('should apply limit and offset', async () => {
    const result = await plugin.query('services', [], {
      limit: 2,
      offset: 1
    });
    
    expect(result.rows).toHaveLength(2);
    expect(result.totalCount).toBe(3);
  });
  
  it('should trace service relationships', async () => {
    const hops = await plugin.trace('service_id', 'svc-1');
    
    expect(hops.length).toBeGreaterThan(0);
    expect(hops.find(h => h.table === 'services')).toBeDefined();
    expect(hops.find(h => h.table === 'deployments')).toBeDefined();
  });
  
  it('should report healthy status', async () => {
    const health = await plugin.healthCheck();
    
    expect(health.healthy).toBe(true);
  });
});
