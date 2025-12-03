/**
 * AWS Plugin - Query AWS resources (EC2, RDS, Lambda)
 */

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeInstancesCommandOutput,
  Instance,
} from '@aws-sdk/client-ec2';
import {
  RDSClient,
  DescribeDBInstancesCommand,
  DBInstance,
} from '@aws-sdk/client-rds';
import {
  LambdaClient,
  ListFunctionsCommand,
  FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import { fromEnv, fromIni } from '@aws-sdk/credential-providers';
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

interface AWSPluginConfig extends PluginConfig {
  region?: string;
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export class AWSPlugin implements DataSourcePlugin {
  name = 'aws';
  version = '1.0.0';
  description = 'AWS infrastructure data source (EC2, RDS, Lambda)';

  private ec2Client?: EC2Client;
  private rdsClient?: RDSClient;
  private lambdaClient?: LambdaClient;
  private region: string = 'us-east-1';

  async initialize(config: AWSPluginConfig): Promise<void> {
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';

    // Configure credentials
    let credentials;
    if (config.accessKeyId && config.secretAccessKey) {
      // Explicit credentials
      credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
      };
    } else if (config.profile) {
      // AWS profile
      credentials = fromIni({ profile: config.profile });
    } else {
      // Default: environment variables or instance profile
      credentials = fromEnv();
    }

    const clientConfig = {
      region: this.region,
      credentials,
    };

    this.ec2Client = new EC2Client(clientConfig);
    this.rdsClient = new RDSClient(clientConfig);
    this.lambdaClient = new LambdaClient(clientConfig);

    console.log(`AWS plugin initialized for region: ${this.region}`);
  }

  async getTables(): Promise<TableInfo[]> {
    return [
      {
        name: 'ec2_instances',
        description: 'EC2 instances',
        columns: [
          { name: 'instance_id', type: 'string' },
          { name: 'instance_type', type: 'string' },
          { name: 'state', type: 'string' },
          { name: 'availability_zone', type: 'string' },
          { name: 'private_ip', type: 'string' },
          { name: 'public_ip', type: 'string' },
          { name: 'launch_time', type: 'string' },
          { name: 'tags', type: 'object' },
        ],
      },
      {
        name: 'rds_instances',
        description: 'RDS database instances',
        columns: [
          { name: 'db_instance_identifier', type: 'string' },
          { name: 'db_instance_class', type: 'string' },
          { name: 'engine', type: 'string' },
          { name: 'engine_version', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'allocated_storage', type: 'number' },
          { name: 'availability_zone', type: 'string' },
          { name: 'endpoint', type: 'string' },
          { name: 'created_time', type: 'string' },
        ],
      },
      {
        name: 'lambda_functions',
        description: 'Lambda functions',
        columns: [
          { name: 'function_name', type: 'string' },
          { name: 'runtime', type: 'string' },
          { name: 'handler', type: 'string' },
          { name: 'memory_size', type: 'number' },
          { name: 'timeout', type: 'number' },
          { name: 'last_modified', type: 'string' },
          { name: 'code_size', type: 'number' },
          { name: 'state', type: 'string' },
        ],
      },
    ];
  }

  async query(
    tableName: string,
    filters: Filter[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    if (!this.ec2Client || !this.rdsClient || !this.lambdaClient) {
      throw new Error('AWS plugin not initialized');
    }

    let rows: any[] = [];
    const tables = await this.getTables();
    const tableInfo = tables.find((t) => t.name === tableName);

    if (!tableInfo) {
      throw new Error(`Table ${tableName} not found in AWS plugin`);
    }

    switch (tableName) {
      case 'ec2_instances':
        rows = await this.queryEC2Instances();
        break;
      case 'rds_instances':
        rows = await this.queryRDSInstances();
        break;
      case 'lambda_functions':
        rows = await this.queryLambdaFunctions();
        break;
      default:
        throw new Error(`Unsupported table: ${tableName}`);
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

    return {
      columns: tableInfo.columns,
      rows,
      rowCount: rows.length,
      totalCount,
    };
  }

  private async queryEC2Instances(): Promise<any[]> {
    const command = new DescribeInstancesCommand({});
    const response = await this.ec2Client!.send(command);

    const instances: any[] = [];
    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        instances.push({
          instance_id: instance.InstanceId,
          instance_type: instance.InstanceType,
          state: instance.State?.Name,
          availability_zone: instance.Placement?.AvailabilityZone,
          private_ip: instance.PrivateIpAddress,
          public_ip: instance.PublicIpAddress,
          launch_time: instance.LaunchTime?.toISOString(),
          tags: this.tagsToObject(instance.Tags),
        });
      }
    }

    return instances;
  }

  private async queryRDSInstances(): Promise<any[]> {
    const command = new DescribeDBInstancesCommand({});
    const response = await this.rdsClient!.send(command);

    const instances: any[] = [];
    for (const dbInstance of response.DBInstances || []) {
      instances.push({
        db_instance_identifier: dbInstance.DBInstanceIdentifier,
        db_instance_class: dbInstance.DBInstanceClass,
        engine: dbInstance.Engine,
        engine_version: dbInstance.EngineVersion,
        status: dbInstance.DBInstanceStatus,
        allocated_storage: dbInstance.AllocatedStorage,
        availability_zone: dbInstance.AvailabilityZone,
        endpoint: dbInstance.Endpoint?.Address,
        created_time: dbInstance.InstanceCreateTime?.toISOString(),
      });
    }

    return instances;
  }

  private async queryLambdaFunctions(): Promise<any[]> {
    const command = new ListFunctionsCommand({});
    const response = await this.lambdaClient!.send(command);

    const functions: any[] = [];
    for (const func of response.Functions || []) {
      functions.push({
        function_name: func.FunctionName,
        runtime: func.Runtime,
        handler: func.Handler,
        memory_size: func.MemorySize,
        timeout: func.Timeout,
        last_modified: func.LastModified,
        code_size: func.CodeSize,
        state: func.State,
      });
    }

    return functions;
  }

  private tagsToObject(tags?: Array<{ Key?: string; Value?: string }>): Record<string, string> {
    const obj: Record<string, string> = {};
    if (tags) {
      for (const tag of tags) {
        if (tag.Key) {
          obj[tag.Key] = tag.Value || '';
        }
      }
    }
    return obj;
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

  async trace(identifier: string, value: string): Promise<TraceHop[]> {
    const hops: TraceHop[] = [];

    // Trace EC2 instance by instance_id
    if (identifier === 'instance_id') {
      try {
        const instances = await this.queryEC2Instances();
        const instance = instances.find((i) => i.instance_id === value);
        if (instance) {
          hops.push({
            source: this.name,
            table: 'ec2_instances',
            data: instance,
            timestamp: instance.launch_time || new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Error tracing EC2 instance:', error);
      }
    }

    return hops;
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      // Simple health check: try to describe instances (doesn't fetch data)
      const command = new DescribeInstancesCommand({ MaxResults: 5 });
      await this.ec2Client!.send(command);
      return { healthy: true, message: 'AWS plugin healthy' };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'AWS health check failed',
      };
    }
  }

  async cleanup(): Promise<void> {
    this.ec2Client?.destroy();
    this.rdsClient?.destroy();
    this.lambdaClient?.destroy();
  }
}
