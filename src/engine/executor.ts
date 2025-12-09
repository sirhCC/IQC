/**
 * Query Executor - Executes parsed queries against plugins
 */

import {
  Query,
  SelectStatement,
  TraceStatement,
  DescribeStatement,
  ShowStatement,
  CacheStatement,
  QueryResult,
  TraceResult,
  DescribeResult,
  ShowResult,
  CacheResult,
  ExecutionError,
  Filter,
  QueryOptions,
  JoinClause,
} from '../types';
import { PluginManager } from '../plugins/plugin-manager';
import { logger, logQuery, logQueryResult, logError } from '../utils/logger';
import {
  groupRows,
  applyAggregates,
  applyAggregatesWithoutGrouping,
  filterHaving,
} from '../utils/aggregation';
import { queryCache } from '../utils/cache';

export class QueryExecutor {
  private static readonly DEFAULT_MAX_RESULTS = 10000;

  constructor(private pluginManager: PluginManager) {}

  async execute(
    query: Query
  ): Promise<QueryResult | TraceResult | DescribeResult | ShowResult | CacheResult> {
    switch (query.type) {
      case 'SELECT':
        return this.executeSelect(query.statement as SelectStatement);
      case 'TRACE':
        return this.executeTrace(query.statement as TraceStatement);
      case 'DESCRIBE':
        return this.executeDescribe(query.statement as DescribeStatement);
      case 'SHOW':
        return this.executeShow(query.statement as ShowStatement);
      case 'CACHE':
        return this.executeCache(query.statement as CacheStatement);
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
        throw new ExecutionError(
          `Table '${statement.from}' not found in any registered data source`
        );
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

      // Check cache before executing query
      // Only cache simple SELECT queries without JOINs, aggregations, or special clauses
      const isCacheable =
        !statement.joins?.length &&
        !statement.columns.some((col) => col.aggregate) &&
        !statement.groupBy?.length &&
        !statement.having;

      if (isCacheable && queryCache.isEnabled()) {
        const cacheOptions = {
          limit: statement.limit,
          offset: statement.offset,
          orderBy: statement.orderBy,
          columns: statement.columns.map((c) => c.name),
        };
        const cachedResult = queryCache.get(statement.from, filters, cacheOptions);
        if (cachedResult) {
          const duration = Date.now() - startTime;
          logger.debug('Returning cached result', {
            table: statement.from,
            rows: cachedResult.rows.length,
            duration: `${duration}ms`,
          });
          return { ...cachedResult, executionTime: duration };
        }
      }

      // Build query options
      const options: QueryOptions = {};
      if (statement.orderBy) {
        options.orderBy = statement.orderBy;
      }
      if (statement.limit !== undefined) {
        options.limit = statement.limit;
      } else {
        // Apply default max results if no limit specified
        options.maxResults = QueryExecutor.DEFAULT_MAX_RESULTS;
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
          // Save original columns for metadata lookup
          const originalColumns = result.columns;

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

          // Update columns metadata - build from statement columns
          result.columns = statement.columns.map((col) => {
            const existingCol = originalColumns.find((c) => c.name === col.name);
            return {
              name: col.alias || col.name,
              type: existingCol?.type || ('string' as const),
              nullable: existingCol?.nullable,
              description: existingCol?.description,
            };
          });
        } else {
          // For SELECT *, apply aliases if any
          for (const col of statement.columns) {
            if (col.alias) {
              const columnMeta = result.columns.find((c) => c.name === col.name);
              if (columnMeta) {
                columnMeta.name = col.alias;
              }
            }
          }
        }
      }

      // Apply max results limit if no explicit LIMIT was set
      // Apply max results limit if no explicit LIMIT was set
      if (statement.limit === undefined && result.rows.length > QueryExecutor.DEFAULT_MAX_RESULTS) {
        result.rows = result.rows.slice(0, QueryExecutor.DEFAULT_MAX_RESULTS);
        result.truncated = true;
        result.warning = `Results truncated to ${QueryExecutor.DEFAULT_MAX_RESULTS} rows. Use LIMIT and OFFSET for pagination, or add a WHERE clause to filter results.`;
        logger.warn(`Query results truncated to ${QueryExecutor.DEFAULT_MAX_RESULTS} rows`, {
          originalCount: result.totalCount,
        });
      }

      const duration = Date.now() - startTime;
      logQueryResult(queryStr, result.rows.length, duration);

      // Cache result if cacheable
      if (isCacheable && queryCache.isEnabled()) {
        const cacheOptions = {
          limit: statement.limit,
          offset: statement.offset,
          orderBy: statement.orderBy,
          columns: statement.columns.map((c) => c.name),
        };
        queryCache.set(statement.from, filters, cacheOptions, result);
      }

      return result;
    } catch (error) {
      logError(error as Error, { query: queryStr, table: statement.from });
      throw error;
    }
  }

  private async executeJoin(
    leftResult: QueryResult,
    join: JoinClause,
    leftTableName: string
  ): Promise<QueryResult> {
    // Find the table to join
    const allTables = await this.pluginManager.getAllTables();
    const rightTableInfo = allTables.find((t) => t.name === join.table);

    if (!rightTableInfo) {
      throw new ExecutionError(`Table '${join.table}' not found in JOIN clause`);
    }

    // Fetch all rows from the right table (no filters for now)
    const rightResult = await this.pluginManager.query(rightTableInfo.source, join.table, [], {});

    const joinedRows: any[] = [];
    const leftRows = leftResult.rows;
    const rightRows = rightResult.rows;

    // Helper function to extract table-qualified field name
    const getFieldName = (
      field: string,
      defaultTable: string
    ): { table: string; field: string } => {
      const parts = field.split('.');
      if (parts.length === 2) {
        return { table: parts[0], field: parts[1] };
      }
      return { table: defaultTable, field };
    };

    const leftFieldInfo = getFieldName(join.on.leftField, leftTableName);
    const rightFieldInfo = getFieldName(join.on.rightField, join.table);

    // Perform the join based on join type
    if (join.type === 'INNER') {
      // INNER JOIN: only matching rows
      for (const leftRow of leftRows) {
        for (const rightRow of rightRows) {
          const leftValue = leftRow[leftFieldInfo.field];
          const rightValue = rightRow[rightFieldInfo.field];

          if (this.compareValues(leftValue, join.on.operator, rightValue)) {
            // Merge rows with table prefixes to avoid conflicts
            const mergedRow: any = {};
            for (const [key, value] of Object.entries(leftRow)) {
              mergedRow[`${leftTableName}.${key}`] = value;
              mergedRow[key] = value; // Also keep unprefixed for convenience
            }
            for (const [key, value] of Object.entries(rightRow)) {
              mergedRow[`${join.table}.${key}`] = value;
              if (!mergedRow[key]) {
                mergedRow[key] = value;
              }
            }
            joinedRows.push(mergedRow);
          }
        }
      }
    } else if (join.type === 'LEFT') {
      // LEFT JOIN: all left rows, matching right rows or nulls
      for (const leftRow of leftRows) {
        let matched = false;

        for (const rightRow of rightRows) {
          const leftValue = leftRow[leftFieldInfo.field];
          const rightValue = rightRow[rightFieldInfo.field];

          if (this.compareValues(leftValue, join.on.operator, rightValue)) {
            matched = true;
            const mergedRow: any = {};
            for (const [key, value] of Object.entries(leftRow)) {
              mergedRow[`${leftTableName}.${key}`] = value;
              mergedRow[key] = value;
            }
            for (const [key, value] of Object.entries(rightRow)) {
              mergedRow[`${join.table}.${key}`] = value;
              if (!mergedRow[key]) {
                mergedRow[key] = value;
              }
            }
            joinedRows.push(mergedRow);
          }
        }

        // If no match, add left row with null values for right table
        if (!matched) {
          const mergedRow: any = {};
          for (const [key, value] of Object.entries(leftRow)) {
            mergedRow[`${leftTableName}.${key}`] = value;
            mergedRow[key] = value;
          }
          for (const col of rightTableInfo.columns) {
            mergedRow[`${join.table}.${col.name}`] = null;
          }
          joinedRows.push(mergedRow);
        }
      }
    } else if (join.type === 'RIGHT') {
      // RIGHT JOIN: all right rows, matching left rows or nulls
      for (const rightRow of rightRows) {
        let matched = false;

        for (const leftRow of leftRows) {
          const leftValue = leftRow[leftFieldInfo.field];
          const rightValue = rightRow[rightFieldInfo.field];

          if (this.compareValues(leftValue, join.on.operator, rightValue)) {
            matched = true;
            const mergedRow: any = {};
            for (const [key, value] of Object.entries(leftRow)) {
              mergedRow[`${leftTableName}.${key}`] = value;
              mergedRow[key] = value;
            }
            for (const [key, value] of Object.entries(rightRow)) {
              mergedRow[`${join.table}.${key}`] = value;
              if (!mergedRow[key]) {
                mergedRow[key] = value;
              }
            }
            joinedRows.push(mergedRow);
          }
        }

        // If no match, add right row with null values for left table
        if (!matched) {
          const mergedRow: any = {};
          for (const col of leftResult.columns) {
            mergedRow[`${leftTableName}.${col.name}`] = null;
          }
          for (const [key, value] of Object.entries(rightRow)) {
            mergedRow[`${join.table}.${key}`] = value;
            mergedRow[key] = value;
          }
          joinedRows.push(mergedRow);
        }
      }
    }

    // Merge column metadata
    const mergedColumns = [
      ...leftResult.columns.map((col) => ({ ...col, name: `${leftTableName}.${col.name}` })),
      ...rightResult.columns.map((col) => ({ ...col, name: `${join.table}.${col.name}` })),
    ];

    return {
      columns: mergedColumns,
      rows: joinedRows,
      rowCount: joinedRows.length,
      totalCount: joinedRows.length,
      source: `${leftResult.source} JOIN ${rightResult.source}`,
    };
  }

  private compareValues(left: any, operator: string, right: any): boolean {
    switch (operator) {
      case '=':
        return left == right;
      case '!=':
        return left != right;
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      default:
        return false;
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

  private async executeCache(statement: CacheStatement): Promise<CacheResult> {
    switch (statement.action) {
      case 'SHOW': {
        const stats = queryCache.getStats();
        return {
          action: 'SHOW',
          stats,
        };
      }

      case 'CLEAR': {
        if (statement.table) {
          queryCache.clearTable(statement.table);
          return {
            action: 'CLEAR',
            message: `Cache cleared for table '${statement.table}'`,
          };
        } else {
          queryCache.clear();
          return {
            action: 'CLEAR',
            message: 'All cache entries cleared',
          };
        }
      }

      case 'SET_TTL': {
        if (!statement.table || statement.ttl === undefined) {
          throw new ExecutionError('SET CACHE TTL requires table name and TTL value');
        }
        queryCache.setTableTTL(statement.table, statement.ttl);
        return {
          action: 'SET_TTL',
          message: `Cache TTL for table '${statement.table}' set to ${statement.ttl}ms`,
        };
      }

      default:
        throw new ExecutionError(`Unsupported cache action: ${statement.action}`);
    }
  }
}
