/**
 * Mock Plugin - Example plugin for testing
 */

import {
  DataSourcePlugin,
  PluginConfig,
  TableInfo,
  QueryResult,
  Filter,
  QueryOptions,
  TraceHop,
  HealthStatus,
} from '../types';

interface MockData {
  services: Array<{
    id: string;
    name: string;
    environment: string;
    version: string;
    status: string;
    cpu_usage: number;
    memory_usage: number;
  }>;
  deployments: Array<{
    id: string;
    service_id: string;
    environment: string;
    timestamp: string;
    version: string;
    status: string;
    deployed_by: string;
    replicas: number;
  }>;
  incidents: Array<{
    id: string;
    service_id: string;
    severity: string;
    description: string;
    status: string;
    created_at: string;
  }>;
}

export class MockPlugin implements DataSourcePlugin {
  name = 'mock';
  version = '1.0.0';
  description = 'Mock data source for testing';
  
  private data: MockData = {
    services: [
      {
        id: 'svc-1',
        name: 'api-gateway',
        environment: 'production',
        version: '2.3.1',
        status: 'active',
        cpu_usage: 45.2,
        memory_usage: 1024,
      },
      {
        id: 'svc-2',
        name: 'auth-service',
        environment: 'production',
        version: '1.5.0',
        status: 'active',
        cpu_usage: 23.1,
        memory_usage: 512,
      },
      {
        id: 'svc-3',
        name: 'data-processor',
        environment: 'staging',
        version: '3.0.0-beta',
        status: 'degraded',
        cpu_usage: 0,
        memory_usage: 0,
      },
    ],
    deployments: [
      {
        id: 'dep-1',
        service_id: 'svc-1',
        environment: 'production',
        timestamp: '2024-01-15T10:30:00Z',
        version: '2.3.1',
        status: 'success',
        deployed_by: 'user@example.com',
        replicas: 2,
      },
      {
        id: 'dep-2',
        service_id: 'svc-2',
        environment: 'production',
        timestamp: '2024-01-14T15:45:00Z',
        version: '1.5.0',
        status: 'success',
        deployed_by: 'ci-bot',
        replicas: 3,
      },
      {
        id: 'dep-3',
        service_id: 'svc-3',
        environment: 'staging',
        timestamp: '2024-01-16T09:00:00Z',
        version: '3.0.0-beta',
        status: 'failed',
        deployed_by: 'user@example.com',
        replicas: 1,
      },
    ],
    incidents: [
      {
        id: 'inc-1',
        service_id: 'svc-1',
        severity: 'high',
        description: 'High latency detected',
        status: 'resolved',
        created_at: '2024-01-10T12:00:00Z',
      },
      {
        id: 'inc-2',
        service_id: 'svc-3',
        severity: 'critical',
        description: 'Service crashed during deployment',
        status: 'open',
        created_at: '2024-01-16T09:15:00Z',
      },
    ],
  };
  
  async initialize(config: PluginConfig): Promise<void> {
    // Mock initialization - nothing to do
    console.log('Mock plugin initialized');
  }
  
  async getTables(): Promise<TableInfo[]> {
    return [
      {
        name: 'services',
        columns: [
          { name: 'id', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'environment', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'cpu_usage', type: 'number' },
          { name: 'memory_usage', type: 'number' },
        ],
      },
      {
        name: 'deployments',
        columns: [
          { name: 'id', type: 'string' },
          { name: 'service_id', type: 'string' },
          { name: 'timestamp', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'deployed_by', type: 'string' },
        ],
      },
      {
        name: 'incidents',
        columns: [
          { name: 'id', type: 'string' },
          { name: 'service_id', type: 'string' },
          { name: 'severity', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'created_at', type: 'string' },
        ],
      },
    ];
  }
  
  async query(
    tableName: string,
    filters: Filter[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    let rows: any[] = [];
    
    switch (tableName) {
      case 'services':
        rows = [...this.data.services];
        break;
      case 'deployments':
        rows = [...this.data.deployments];
        break;
      case 'incidents':
        rows = [...this.data.incidents];
        break;
      default:
        throw new Error(`Unknown table: ${tableName}`);
    }
    
    // Apply filters
    rows = this.applyFilters(rows, filters);
    
    // Apply sorting
    if (options?.orderBy) {
      for (const order of options.orderBy.reverse()) {
        rows.sort((a, b) => {
          const aVal = a[order.field];
          const bVal = b[order.field];
          const compare = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return order.direction === 'DESC' ? -compare : compare;
        });
      }
    }
    
    const totalCount = rows.length;
    
    // Apply pagination
    if (options?.offset) {
      rows = rows.slice(options.offset);
    }
    if (options?.limit) {
      rows = rows.slice(0, options.limit);
    }
    
    const tables = await this.getTables();
    const tableInfo = tables.find((t) => t.name === tableName)!;
    
    return {
      columns: tableInfo.columns,
      rows,
      rowCount: rows.length,
      totalCount,
    };
  }
  
  async trace(identifier: string, value: string): Promise<TraceHop[]> {
    const hops: TraceHop[] = [];
    
    if (identifier === 'service_id') {
      const service = this.data.services.find((s) => s.id === value);
      if (service) {
        hops.push({
          source: this.name,
          table: 'services',
          data: service,
          timestamp: new Date().toISOString(),
        });
        
        const deployments = this.data.deployments.filter((d) => d.service_id === value);
        deployments.forEach((dep) => {
          hops.push({
            source: this.name,
            table: 'deployments',
            data: dep,
            timestamp: dep.timestamp,
          });
        });
        
        const incidents = this.data.incidents.filter((i) => i.service_id === value);
        incidents.forEach((inc) => {
          hops.push({
            source: this.name,
            table: 'incidents',
            data: inc,
            timestamp: inc.created_at,
          });
        });
      }
    }
    
    return hops;
  }
  
  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, message: 'Mock plugin is healthy' };
  }
  
  private applyFilters(rows: any[], filters: Filter[]): any[] {
    return rows.filter((row) => {
      return filters.every((filter) => {
        const value = row[filter.field];
        
        switch (filter.operator) {
          case '=':
            return value === filter.value;
          case '!=':
            return value !== filter.value;
          case '>':
            return value > filter.value;
          case '<':
            return value < filter.value;
          case '>=':
            return value >= filter.value;
          case '<=':
            return value <= filter.value;
          case 'LIKE':
            return String(value).includes(String(filter.value));
          case 'IN':
            return Array.isArray(filter.value) && filter.value.includes(value);
          case 'BETWEEN':
            return value >= filter.value && value <= (filter as any).secondValue;
          default:
            return true;
        }
      });
    });
  }
}
