/**
 * Plugin Manager - Manages data source plugins
 */

import {
  DataSourcePlugin,
  PluginConfig,
  PluginError,
  TableInfo,
  QueryResult,
  Filter,
  QueryOptions,
  TraceHop,
  HealthStatus,
} from '../types';
import { logger, logPluginAction, logError } from '../utils/logger';

export class PluginManager {
  private plugins: Map<string, DataSourcePlugin> = new Map();
  private initialized: Set<string> = new Set();
  
  async registerPlugin(plugin: DataSourcePlugin, config?: PluginConfig): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new PluginError(`Plugin '${plugin.name}' is already registered`);
    }
    
    logPluginAction(plugin.name, 'registering', config);
    this.plugins.set(plugin.name, plugin);
    
    try {
      await plugin.initialize(config || {});
      this.initialized.add(plugin.name);
      logPluginAction(plugin.name, 'registered');
    } catch (error) {
      this.plugins.delete(plugin.name);
      logError(error as Error, { plugin: plugin.name, action: 'register' });
      throw new PluginError(
        `Failed to initialize plugin '${plugin.name}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { plugin: plugin.name, error }
      );
    }
  }
  
  async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new PluginError(`Plugin '${name}' not found`);
    }
    
    if (plugin.cleanup) {
      try {
        await plugin.cleanup();
      } catch (error) {
        console.error(`Error cleaning up plugin '${name}':`, error);
      }
    }
    
    this.plugins.delete(name);
    this.initialized.delete(name);
  }
  
  getPlugin(name: string): DataSourcePlugin {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new PluginError(`Plugin '${name}' not found`);
    }
    if (!this.initialized.has(name)) {
      throw new PluginError(`Plugin '${name}' not initialized`);
    }
    return plugin;
  }
  
  listPlugins(): Array<{ name: string; version: string; description?: string }> {
    return Array.from(this.plugins.values()).map((plugin) => ({
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
    }));
  }
  
  async getAllTables(): Promise<Array<TableInfo & { source: string }>> {
    const allTables: Array<TableInfo & { source: string }> = [];
    
    for (const [name, plugin] of this.plugins) {
      if (this.initialized.has(name)) {
        try {
          const tables = await plugin.getTables();
          tables.forEach((table) => {
            allTables.push({ ...table, source: name });
          });
        } catch (error) {
          console.error(`Error getting tables from plugin '${name}':`, error);
        }
      }
    }
    
    return allTables;
  }
  
  async query(
    pluginName: string,
    tableName: string,
    filters: Filter[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    const plugin = this.getPlugin(pluginName);
    
    try {
      return await plugin.query(tableName, filters, options);
    } catch (error) {
      throw new PluginError(
        `Query failed for plugin '${pluginName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        { plugin: pluginName, table: tableName, error }
      );
    }
  }
  
  async trace(identifier: string, value: string, sources: string[]): Promise<TraceHop[]> {
    const allHops: TraceHop[] = [];
    
    for (const sourceName of sources) {
      const plugin = this.getPlugin(sourceName);
      
      if (!plugin.trace) {
        console.warn(`Plugin '${sourceName}' does not support tracing`);
        continue;
      }
      
      try {
        const hops = await plugin.trace(identifier, value);
        allHops.push(...hops);
      } catch (error) {
        console.error(`Trace failed for plugin '${sourceName}':`, error);
      }
    }
    
    return allHops.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
  
  async healthCheck(): Promise<Record<string, HealthStatus>> {
    const results: Record<string, HealthStatus> = {};
    
    for (const [name, plugin] of this.plugins) {
      if (this.initialized.has(name) && plugin.healthCheck) {
        try {
          results[name] = await plugin.healthCheck();
        } catch (error) {
          results[name] = {
            healthy: false,
            message: error instanceof Error ? error.message : 'Health check failed',
          };
        }
      }
    }
    
    return results;
  }
  
  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];
    
    for (const [name, plugin] of this.plugins) {
      if (plugin.cleanup) {
        cleanupPromises.push(
          plugin.cleanup().catch((error) => {
            console.error(`Error cleaning up plugin '${name}':`, error);
          })
        );
      }
    }
    
    await Promise.all(cleanupPromises);
    this.plugins.clear();
    this.initialized.clear();
  }
}
