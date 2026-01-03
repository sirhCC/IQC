/**
 * Docker Plugin - Query Docker containers and images
 */

import Docker from 'dockerode';
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
import { logger, logPluginAction, logError } from '../utils/logger';
import { withRetryAndTimeout } from '../utils/retry';

interface DockerPluginConfig extends PluginConfig {
  socketPath?: string;
  host?: string;
  port?: number;
}

export class DockerPlugin implements DataSourcePlugin {
  name = 'docker';
  version = '1.0.0';
  description = 'Docker container and image data source';

  private docker?: Docker;
  private socketPath: string;
  private host?: string;
  private port?: number;

  constructor() {
    // Default Docker socket paths by OS
    this.socketPath = process.platform === 'win32'
      ? '//./pipe/docker_engine'
      : '/var/run/docker.sock';
  }

  async initialize(config: DockerPluginConfig): Promise<void> {
    this.socketPath = config.socketPath || this.socketPath;
    this.host = config.host || process.env.DOCKER_HOST;
    this.port = config.port;

    try {
      // Initialize Docker client
      const dockerOptions: Docker.DockerOptions = {};
      
      if (this.host && this.port) {
        dockerOptions.host = this.host;
        dockerOptions.port = this.port;
      } else {
        dockerOptions.socketPath = this.socketPath;
      }

      this.docker = new Docker(dockerOptions);

      // Test connection
      await this.docker.ping();

      logger.info(`Docker plugin initialized`, {
        socketPath: this.socketPath,
        host: this.host,
        port: this.port,
      });
    } catch (error) {
      logError(error as Error, {
        message: 'Failed to initialize Docker plugin',
        socketPath: this.socketPath,
      });
      throw error;
    }
  }

  async getTables(): Promise<TableInfo[]> {
    return [
      {
        name: 'docker_containers',
        description: 'Docker containers',
        columns: [
          { name: 'container_id', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'image', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'state', type: 'string' },
          { name: 'created', type: 'string' },
          { name: 'ports', type: 'array' },
          { name: 'labels', type: 'object' },
        ],
      },
      {
        name: 'docker_images',
        description: 'Docker images',
        columns: [
          { name: 'image_id', type: 'string' },
          { name: 'repository', type: 'string' },
          { name: 'tag', type: 'string' },
          { name: 'size', type: 'number' },
          { name: 'created', type: 'string' },
          { name: 'labels', type: 'object' },
        ],
      },
      {
        name: 'docker_volumes',
        description: 'Docker volumes',
        columns: [
          { name: 'name', type: 'string' },
          { name: 'driver', type: 'string' },
          { name: 'mountpoint', type: 'string' },
          { name: 'created', type: 'string' },
          { name: 'labels', type: 'object' },
        ],
      },
      {
        name: 'docker_networks',
        description: 'Docker networks',
        columns: [
          { name: 'network_id', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'driver', type: 'string' },
          { name: 'scope', type: 'string' },
          { name: 'created', type: 'string' },
        ],
      },
    ];
  }

  async query(
    tableName: string,
    filters: Filter[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    if (!this.docker) {
      throw new Error('Docker plugin not initialized');
    }

    let rows: any[] = [];
    const tables = await this.getTables();
    const tableInfo = tables.find((t) => t.name === tableName);

    if (!tableInfo) {
      throw new Error(`Table ${tableName} not found in Docker plugin`);
    }

    switch (tableName) {
      case 'docker_containers':
        rows = await this.queryContainers();
        break;
      case 'docker_images':
        rows = await this.queryImages();
        break;
      case 'docker_volumes':
        rows = await this.queryVolumes();
        break;
      case 'docker_networks':
        rows = await this.queryNetworks();
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

  private async queryContainers(): Promise<any[]> {
    try {
      const containers = await withRetryAndTimeout(() =>
        this.docker!.listContainers({ all: true })
      );

      return containers.map((container: any) => {
        const name = (container.Names || []).map((n: string) => n.replace(/^\//, '')).join(', ');
        const ports = (container.Ports || []).map((p: any) => ({
          private: p.PrivatePort,
          public: p.PublicPort,
          type: p.Type,
        }));

        return {
          container_id: container.Id.substring(0, 12),
          name,
          image: container.Image,
          status: container.Status,
          state: container.State,
          created: new Date(container.Created * 1000).toISOString(),
          ports,
          labels: container.Labels || {},
        };
      });
    } catch (error) {
      logError(error as Error, { message: 'Failed to query Docker containers' });
      throw error;
    }
  }

  private async queryImages(): Promise<any[]> {
    try {
      const images = await withRetryAndTimeout(() =>
        this.docker!.listImages({ all: true })
      );

      return images.map((image: any) => {
        const repoTags = image.RepoTags || ['<none>:<none>'];
        const [repository, tag] = repoTags[0].split(':');

        return {
          image_id: image.Id.replace('sha256:', '').substring(0, 12),
          repository,
          tag,
          size: image.Size,
          created: new Date(image.Created * 1000).toISOString(),
          labels: image.Labels || {},
        };
      });
    } catch (error) {
      logError(error as Error, { message: 'Failed to query Docker images' });
      throw error;
    }
  }

  private async queryVolumes(): Promise<any[]> {
    try {
      const response = await withRetryAndTimeout(() =>
        this.docker!.listVolumes()
      );

      const volumes = response.Volumes || [];
      return volumes.map((volume: any) => ({
        name: volume.Name,
        driver: volume.Driver,
        mountpoint: volume.Mountpoint,
        created: volume.CreatedAt,
        labels: volume.Labels || {},
      }));
    } catch (error) {
      logError(error as Error, { message: 'Failed to query Docker volumes' });
      throw error;
    }
  }

  private async queryNetworks(): Promise<any[]> {
    try {
      const networks = await withRetryAndTimeout(() =>
        this.docker!.listNetworks()
      );

      return networks.map((network: any) => ({
        network_id: network.Id.substring(0, 12),
        name: network.Name,
        driver: network.Driver,
        scope: network.Scope,
        created: network.Created,
      }));
    } catch (error) {
      logError(error as Error, { message: 'Failed to query Docker networks' });
      throw error;
    }
  }

  private applyFilters(rows: any[], filters: Filter[]): any[] {
    return rows.filter((row) => {
      return filters.every((filter) => {
        const value = row[filter.field];

        switch (filter.operator) {
          case '=':
            return value == filter.value;
          case '!=':
            return value != filter.value;
          case '>':
            return value > filter.value;
          case '<':
            return value < filter.value;
          case '>=':
            return value >= filter.value;
          case '<=':
            return value <= filter.value;
          case 'LIKE':
            return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
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
    if (!this.docker) {
      throw new Error('Docker plugin not initialized');
    }

    const hops: TraceHop[] = [];

    try {
      // Trace by container_id or name
      if (identifier === 'container_id' || identifier === 'name') {
        const containers = await this.docker.listContainers({ all: true });
        const container = containers.find((c: any) => {
          const id = c.Id.substring(0, 12);
          const names = (c.Names || []).map((n: string) => n.replace(/^\//, ''));
          return id === value || names.includes(value) || c.Id === value;
        });

        if (container) {
          // Add container hop
          hops.push({
            source: this.name,
            table: 'docker_containers',
            timestamp: new Date(container.Created * 1000).toISOString(),
            data: {
              container_id: container.Id.substring(0, 12),
              name: container.Names?.[0]?.replace(/^\//, ''),
              image: container.Image,
              status: container.Status,
              state: container.State,
            },
          });

          // Find related image
          const images = await this.docker.listImages({ all: true });
          const image = images.find((img: any) => 
            container.ImageID === img.Id || container.Image === img.RepoTags?.[0]
          );

          if (image) {
            hops.push({
              source: this.name,
              table: 'docker_images',
              timestamp: new Date(image.Created * 1000).toISOString(),
              data: {
                image_id: image.Id.replace('sha256:', '').substring(0, 12),
                repository: image.RepoTags?.[0]?.split(':')[0] || '<none>',
                tag: image.RepoTags?.[0]?.split(':')[1] || '<none>',
                size: image.Size,
              },
            });
          }

          // Find related volumes (from container mounts)
          if (container.Mounts && container.Mounts.length > 0) {
            const volumeResponse = await this.docker.listVolumes();
            const volumes = volumeResponse.Volumes || [];
            
            for (const mount of container.Mounts) {
              if (mount.Type === 'volume') {
                const volume = volumes.find((v: any) => v.Name === mount.Name);
                if (volume) {
                  hops.push({
                    source: this.name,
                    table: 'docker_volumes',
                    timestamp: new Date().toISOString(),
                    data: {
                      name: volume.Name,
                      driver: volume.Driver,
                      mountpoint: volume.Mountpoint,
                    },
                  });
                }
              }
            }
          }

          // Find related networks
          if (container.NetworkSettings && container.NetworkSettings.Networks) {
            const networkNames = Object.keys(container.NetworkSettings.Networks);
            const networks = await this.docker.listNetworks();
            
            for (const networkName of networkNames) {
              const network = networks.find((n: any) => n.Name === networkName);
              if (network) {
                hops.push({
                  source: this.name,
                  table: 'docker_networks',
                  timestamp: network.Created || new Date().toISOString(),
                  data: {
                    network_id: network.Id.substring(0, 12),
                    name: network.Name,
                    driver: network.Driver,
                    scope: network.Scope,
                  },
                });
              }
            }
          }
        }
      }

      // Trace by image
      if (identifier === 'image' || identifier === 'image_id') {
        const images = await this.docker.listImages({ all: true });
        const image = images.find((img: any) => {
          const id = img.Id.replace('sha256:', '').substring(0, 12);
          const repoTag = img.RepoTags?.[0];
          return id === value || img.Id === value || repoTag === value;
        });

        if (image) {
          hops.push({
            source: this.name,
            table: 'docker_images',
            timestamp: new Date(image.Created * 1000).toISOString(),
            data: {
              image_id: image.Id.replace('sha256:', '').substring(0, 12),
              repository: image.RepoTags?.[0]?.split(':')[0] || '<none>',
              tag: image.RepoTags?.[0]?.split(':')[1] || '<none>',
              size: image.Size,
            },
          });

          // Find containers using this image
          const containers = await this.docker.listContainers({ all: true });
          const relatedContainers = containers.filter((c: any) => 
            c.ImageID === image.Id || c.Image === image.RepoTags?.[0]
          );

          for (const container of relatedContainers) {
            hops.push({
              source: this.name,
              table: 'docker_containers',
              timestamp: new Date(container.Created * 1000).toISOString(),
              data: {
                container_id: container.Id.substring(0, 12),
                name: container.Names?.[0]?.replace(/^\//, ''),
                status: container.Status,
                state: container.State,
              },
            });
          }
        }
      }
    } catch (error) {
      logError(error as Error, { 
        message: 'Failed to trace Docker resource',
        identifier,
        value,
      });
    }

    return hops;
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      if (!this.docker) {
        return {
          healthy: false,
          message: 'Docker plugin not initialized',
        };
      }

      await this.docker.ping();
      return {
        healthy: true,
        message: 'Docker daemon accessible',
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Docker daemon not accessible: ${(error as Error).message}`,
      };
    }
  }

  async cleanup(): Promise<void> {
    // Nothing to cleanup
  }
}
