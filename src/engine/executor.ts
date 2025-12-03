/**
 * Query Executor - Executes parsed queries against plugins
 */

import {
  Query,
  SelectStatement,
  TraceStatement,
  DescribeStatement,
  ShowStatement,
  QueryResult,
  TraceResult,
  DescribeResult,
  ShowResult,
  ExecutionError,
  Filter,
  QueryOptions,
} from '../types';
import { PluginManager } from '../plugins/plugin-manager';

export class QueryExecutor {
  constructor(private pluginManager: PluginManager) {}
  
  async execute(query: Query): Promise<QueryResult | TraceResult | DescribeResult | ShowResult> {
    switch (query.type) {
      case 'SELECT':
        return this.executeSelect(query.statement as SelectStatement);
      case 'TRACE':
        return this.executeTrace(query.statement as TraceStatement);
      case 'DESCRIBE':
        return this.executeDescribe(query.statement as DescribeStatement);
      case 'SHOW':
        return this.executeShow(query.statement as ShowStatement);
      default:
        throw new ExecutionError(`Unsupported query type`);
    }
  }
  
  private async executeSelect(statement: SelectStatement): Promise<QueryResult> {
    // Find which plugin owns this table
    const allTables = await this.pluginManager.getAllTables();
    const tableInfo = allTables.find((t) => t.name === statement.from);
    
    if (!tableInfo) {
      throw new ExecutionError(`Table '${statement.from}' not found in any registered data source`);
    }
    
    // Convert WHERE clause to filters
    const filters: Filter[] = [];
    if (statement.where) {
      for (const condition of statement.where.conditions) {
        filters.push({
          field: condition.field,
          operator: condition.operator,
          value: condition.value,
        });
      }
    }
    
    // Build query options
    const options: QueryOptions = {};
    if (statement.orderBy) {
      options.orderBy = statement.orderBy;
    }
    if (statement.limit !== undefined) {
      options.limit = statement.limit;
    }
    if (statement.offset !== undefined) {
      options.offset = statement.offset;
    }
    
    // Execute query through plugin
    const result = await this.pluginManager.query(
      tableInfo.source,
      statement.from,
      filters,
      options
    );
    
    // Apply column selection
    if (statement.columns.length > 0 && statement.columns[0].name !== '*') {
      const selectedColumns = statement.columns.map((col) => col.name);
      result.rows = result.rows.map((row) => {
        const newRow: Record<string, any> = {};
        for (const col of statement.columns) {
          if (row[col.name] !== undefined) {
            const key = col.alias || col.name;
            newRow[key] = row[col.name];
          }
        }
        return newRow;
      });
      
      // Update columns metadata
      result.columns = result.columns.filter((col) =>
        selectedColumns.includes(col.name)
      );
    }
    
    // Apply aliases to column metadata
    for (const col of statement.columns) {
      if (col.alias) {
        const columnMeta = result.columns.find((c) => c.name === col.name);
        if (columnMeta) {
          columnMeta.name = col.alias;
        }
      }
    }
    
    return result;
  }
  
  private async executeTrace(statement: TraceStatement): Promise<TraceResult> {
    const hops = await this.pluginManager.trace(
      statement.identifier,
      statement.value,
      statement.through
    );
    
    return {
      identifier: statement.identifier,
      value: statement.value,
      hops,
      totalHops: hops.length,
    };
  }
  
  private async executeDescribe(statement: DescribeStatement): Promise<DescribeResult> {
    const allTables = await this.pluginManager.getAllTables();
    const tableInfo = allTables.find((t) => t.name === statement.target);
    
    if (!tableInfo) {
      throw new ExecutionError(`Table '${statement.target}' not found`);
    }
    
    return {
      table: tableInfo.name,
      source: tableInfo.source,
      columns: tableInfo.columns,
    };
  }
  
  private async executeShow(statement: ShowStatement): Promise<ShowResult> {
    switch (statement.what) {
      case 'TABLES': {
        const tables = await this.pluginManager.getAllTables();
        return {
          what: 'TABLES',
          items: tables.map((t) => ({
            name: t.name,
            source: t.source,
            columns: t.columns.length,
          })),
        };
      }
      
      case 'PLUGINS':
      case 'SOURCES': {
        const plugins = this.pluginManager.listPlugins();
        return {
          what: statement.what,
          items: plugins,
        };
      }
      
      default:
        throw new ExecutionError(`Unsupported SHOW target: ${statement.what}`);
    }
  }
}
