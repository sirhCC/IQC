/**
 * Kubernetes Plugin - Query Kubernetes resources
 */

import * as k8s from '@kubernetes/client-node';
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

interface K8sPluginConfig extends PluginConfig {
  context?: string;
  kubeconfig?: string;
  namespace?: string;
}

export class KubernetesPlugin implements DataSourcePlugin {
  name = 'kubernetes';
  version = '1.0.0';
  description = 'Kubernetes cluster data source (Pods, Deployments, Services)';

  private kc: k8s.KubeConfig;
  private coreApi?: k8s.CoreV1Api;
  private appsApi?: k8s.AppsV1Api;
  private context?: string;
  private namespace: string = 'default';
  private kubeconfig?: string;

  constructor() {
    this.kc = new k8s.KubeConfig();
  }

  async initialize(config: K8sPluginConfig): Promise<void> {
    this.context = config.context || process.env.KUBECONTEXT;
    this.namespace = config.namespace || process.env.KUBE_NAMESPACE || 'default';
    this.kubeconfig = config.kubeconfig || process.env.KUBECONFIG;

    try {
      // Load kubeconfig
      if (this.kubeconfig) {
        this.kc.loadFromFile(this.kubeconfig);
      } else {
        this.kc.loadFromDefault();
      }

      // Set context if specified
      if (this.context) {
        this.kc.setCurrentContext(this.context);
      }

      // Initialize API clients
      this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
      this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);

      logger.info(`Kubernetes plugin initialized`, {
        context: this.kc.getCurrentContext(),
        namespace: this.namespace,
      });
    } catch (error) {
      logError(error as Error, {
        message: 'Failed to initialize Kubernetes plugin',
        context: this.context,
        namespace: this.namespace,
      });
      throw error;
    }
  }

  async getTables(): Promise<TableInfo[]> {
    return [
      {
        name: 'k8s_pods',
        description: 'Kubernetes pods',
        columns: [
          { name: 'name', type: 'string' },
          { name: 'namespace', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'node', type: 'string' },
          { name: 'ip', type: 'string' },
          { name: 'restarts', type: 'number' },
          { name: 'age', type: 'string' },
          { name: 'labels', type: 'object' },
        ],
      },
      {
        name: 'k8s_deployments',
        description: 'Kubernetes deployments',
        columns: [
          { name: 'name', type: 'string' },
          { name: 'namespace', type: 'string' },
          { name: 'replicas', type: 'number' },
          { name: 'ready_replicas', type: 'number' },
          { name: 'available_replicas', type: 'number' },
          { name: 'image', type: 'string' },
          { name: 'labels', type: 'object' },
        ],
      },
      {
        name: 'k8s_services',
        description: 'Kubernetes services',
        columns: [
          { name: 'name', type: 'string' },
          { name: 'namespace', type: 'string' },
          { name: 'type', type: 'string' },
          { name: 'cluster_ip', type: 'string' },
          { name: 'external_ip', type: 'string' },
          { name: 'ports', type: 'array' },
          { name: 'selector', type: 'object' },
        ],
      },
      {
        name: 'k8s_nodes',
        description: 'Kubernetes nodes',
        columns: [
          { name: 'name', type: 'string' },
          { name: 'status', type: 'string' },
          { name: 'role', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'cpu_capacity', type: 'string' },
          { name: 'memory_capacity', type: 'string' },
          { name: 'pods_capacity', type: 'number' },
        ],
      },
    ];
  }

  async query(
    tableName: string,
    filters: Filter[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    if (!this.coreApi || !this.appsApi) {
      throw new Error('Kubernetes plugin not initialized');
    }

    let rows: any[] = [];
    const tables = await this.getTables();
    const tableInfo = tables.find((t) => t.name === tableName);

    if (!tableInfo) {
      throw new Error(`Table ${tableName} not found in Kubernetes plugin`);
    }

    switch (tableName) {
      case 'k8s_pods':
        rows = await this.queryPods();
        break;
      case 'k8s_deployments':
        rows = await this.queryDeployments();
        break;
      case 'k8s_services':
        rows = await this.queryServices();
        break;
      case 'k8s_nodes':
        rows = await this.queryNodes();
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

  private async queryPods(): Promise<any[]> {
    try {
      const response = await withRetryAndTimeout(() =>
        this.coreApi!.listPodForAllNamespaces()
      );

      return response.items.map((pod: k8s.V1Pod) => {
        const containerStatuses = pod.status?.containerStatuses || [];
        const restarts = containerStatuses.reduce(
          (sum, cs) => sum + (cs.restartCount || 0),
          0
        );

        return {
          name: pod.metadata?.name || '',
          namespace: pod.metadata?.namespace || '',
          status: pod.status?.phase || 'Unknown',
          node: pod.spec?.nodeName || '',
          ip: pod.status?.podIP || '',
          restarts,
          age: this.calculateAge(pod.metadata?.creationTimestamp),
          labels: pod.metadata?.labels || {},
        };
      });
    } catch (error) {
      logError(error as Error, { message: 'Failed to query Kubernetes pods' });
      throw error;
    }
  }

  private async queryDeployments(): Promise<any[]> {
    try {
      const response = await withRetryAndTimeout(() =>
        this.appsApi!.listDeploymentForAllNamespaces()
      );

      return response.items.map((deploy: k8s.V1Deployment) => {
        const containers = deploy.spec?.template?.spec?.containers || [];
        const images = containers.map((c) => c.image).join(', ');

        return {
          name: deploy.metadata?.name || '',
          namespace: deploy.metadata?.namespace || '',
          replicas: deploy.spec?.replicas || 0,
          ready_replicas: deploy.status?.readyReplicas || 0,
          available_replicas: deploy.status?.availableReplicas || 0,
          image: images,
          labels: deploy.metadata?.labels || {},
        };
      });
    } catch (error) {
      logError(error as Error, { message: 'Failed to query Kubernetes deployments' });
      throw error;
    }
  }

  private async queryServices(): Promise<any[]> {
    try {
      const response = await withRetryAndTimeout(() =>
        this.coreApi!.listServiceForAllNamespaces()
      );

      return response.items.map((svc: k8s.V1Service) => {
        const ports = (svc.spec?.ports || []).map((p) => ({
          port: p.port,
          targetPort: p.targetPort,
          protocol: p.protocol,
        }));

        const externalIPs = svc.status?.loadBalancer?.ingress?.map(
          (i) => i.ip || i.hostname
        ).join(', ') || '';

        return {
          name: svc.metadata?.name || '',
          namespace: svc.metadata?.namespace || '',
          type: svc.spec?.type || 'ClusterIP',
          cluster_ip: svc.spec?.clusterIP || '',
          external_ip: externalIPs,
          ports,
          selector: svc.spec?.selector || {},
        };
      });
    } catch (error) {
      logError(error as Error, { message: 'Failed to query Kubernetes services' });
      throw error;
    }
  }

  private async queryNodes(): Promise<any[]> {
    try {
      const response = await withRetryAndTimeout(() =>
        this.coreApi!.listNode()
      );

      return response.items.map((node: k8s.V1Node) => {
        const conditions = node.status?.conditions || [];
        const readyCondition = conditions.find((c) => c.type === 'Ready');
        const status = readyCondition?.status === 'True' ? 'Ready' : 'NotReady';

        const labels = node.metadata?.labels || {};
        const role = labels['node-role.kubernetes.io/control-plane'] ? 'control-plane' :
                     labels['node-role.kubernetes.io/master'] ? 'master' : 'worker';

        const capacity = node.status?.capacity || {};
        const allocatable = node.status?.allocatable || {};

        return {
          name: node.metadata?.name || '',
          status,
          role,
          version: node.status?.nodeInfo?.kubeletVersion || '',
          cpu_capacity: capacity.cpu || '',
          memory_capacity: capacity.memory || '',
          pods_capacity: parseInt(capacity.pods || '0'),
        };
      });
    } catch (error) {
      logError(error as Error, { message: 'Failed to query Kubernetes nodes' });
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

  private calculateAge(timestamp?: Date | string): string {
    if (!timestamp) return 'Unknown';

    const created = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - created.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  async trace(identifier: string, value: string): Promise<TraceHop[]> {
    // TODO: Implement pod trace (e.g., follow a pod through events)
    return [];
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      if (!this.coreApi) {
        return {
          healthy: false,
          message: 'Kubernetes plugin not initialized',
        };
      }

      // Test connection by listing namespaces
      await this.coreApi.listNamespace();
      return {
        healthy: true,
        message: 'Kubernetes cluster accessible',
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Kubernetes cluster not accessible: ${(error as Error).message}`,
      };
    }
  }

  async cleanup(): Promise<void> {
    // Nothing to cleanup
  }
}
