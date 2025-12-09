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
import { logger, logQuery, logQueryResult, logError } from '../utils/logger';
import { groupRows, applyAggregates, applyAggregatesWithoutGrouping, filterHaving } from '../utils/aggregation';

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
    const startTime = Date.now();
    const queryStr = `SELECT ${statement.columns.join(', ')} FROM ${statement.from}`;
    
    try {
      logQuery(queryStr);
      
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
    let result = await this.pluginManager.query(
      tableInfo.source,
      statement.from,
      filters,
      options
    );
    
    // Execute JOINs if present
    if (statement.joins && statement.joins.length > 0) {
      for (const join of statement.joins) {
        result = await this.executeJoin(result, join, statement.from);
      }
    }
    
    // Check if aggregation is needed
    const hasAggregates = statement.columns.some((col) => col.aggregate);
    
    if (hasAggregates) {
      // Apply aggregation
      if (statement.groupBy && statement.groupBy.length > 0) {
        // GROUP BY aggregation
        const grouped = groupRows(result.rows, statement.groupBy);
        result.rows = applyAggregates(grouped, statement.columns, statement.groupBy);
      } else {
        // Aggregation without GROUP BY
        result.rows = applyAggregatesWithoutGrouping(result.rows, statement.columns);
      }
      
      // Apply HAVING filter if present
      if (statement.having) {
        result.rows = filterHaving(result.rows, statement.having.conditions);
      }
      
      // Update column metadata for aggregates
      result.columns = statement.columns.map((col) => {
        if (col.aggregate) {
          return {
            name: col.alias || `${col.aggregate.toLowerCase()}(${col.name})`,
            type: 'number' as const,
          };
        } else {
          const existingCol = tableInfo.columns.find((c) => c.name === col.name);
          return existingCol || { name: col.name, type: 'string' as const };
        }
      });
    } else {
      // Apply column selection (no aggregation)
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
    }
    
    const duration = Date.now() - startTime;
    logQueryResult(queryStr, result.rows.length, duration);
    return result;
    } catch (error) {
      logError(error as Error, { query: queryStr, table: statement.from });
      throw error;
    }
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
