import { AWSPlugin } from '../src/plugins/aws-plugin';

describe('AWSPlugin', () => {
  let plugin: AWSPlugin;
  
  beforeEach(() => {
    plugin = new AWSPlugin();
  });
  
  it('should have correct metadata', () => {
    expect(plugin.name).toBe('aws');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.description).toContain('AWS');
  });
  
  it('should return available tables', async () => {
    await plugin.initialize({ region: 'us-east-1' });
    const tables = await plugin.getTables();
    
    expect(tables).toHaveLength(3);
    expect(tables.map(t => t.name)).toEqual([
      'ec2_instances',
      'rds_instances',
      'lambda_functions'
    ]);
  });
  
  it('should have proper column definitions', async () => {
    await plugin.initialize({ region: 'us-east-1' });
    const tables = await plugin.getTables();
    
    const ec2Table = tables.find(t => t.name === 'ec2_instances');
    expect(ec2Table).toBeDefined();
    expect(ec2Table?.columns).toContainEqual(
      expect.objectContaining({ name: 'instance_id', type: 'string' })
    );
    expect(ec2Table?.columns).toContainEqual(
      expect.objectContaining({ name: 'instance_type', type: 'string' })
    );
  });
  
  // Note: Integration tests with real AWS require credentials
  // These would be run separately with proper AWS test account
  it.skip('should query EC2 instances', async () => {
    await plugin.initialize({ region: 'us-east-1' });
    const result = await plugin.query('ec2_instances', []);
    expect(result.columns).toBeDefined();
    expect(result.rows).toBeDefined();
  });
});
