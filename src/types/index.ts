/**
 * Core types for Infrastructure Query Language
 */

// Query AST types
export interface Query {
  type: 'SELECT' | 'TRACE' | 'DESCRIBE' | 'SHOW';
  statement: SelectStatement | TraceStatement | DescribeStatement | ShowStatement;
}

export interface SelectStatement {
  columns: Column[];
  from: string;
  where?: WhereClause;
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
}

export interface TraceStatement {
  identifier: string;
  value: string;
  through: string[];
}

export interface DescribeStatement {
  target: string;
}

export interface ShowStatement {
  what: 'TABLES' | 'PLUGINS' | 'SOURCES';
}

export interface Column {
  name: string;
  alias?: string;
  aggregate?: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
}

export interface WhereClause {
  conditions: Condition[];
  operator: 'AND' | 'OR';
}

export interface Condition {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'BETWEEN';
  value: any;
  secondValue?: any;
}

export interface OrderByClause {
  field: string;
  direction: 'ASC' | 'DESC';
}

// Data types
export type Row = Record<string, any>;

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Row[];
  rowCount: number;
  totalCount: number;
  executionTime?: number;
  source?: string;
}

export interface TraceResult {
  identifier: string;
  value: string;
  hops: TraceHop[];
  totalHops: number;
  totalTime?: number;
}

export interface TraceHop {
  source: string;
  table: string;
  timestamp: string;
  duration?: number;
  data: Record<string, any>;
}

export interface DescribeResult {
  table: string;
  source: string;
  columns: ColumnInfo[];
}

export interface ShowResult {
  what: 'TABLES' | 'PLUGINS' | 'SOURCES';
  items: any[];
}

// Plugin system
export interface DataSourcePlugin {
  name: string;
  version: string;
  description?: string;
  
  initialize(config: PluginConfig): Promise<void>;
  getTables(): Promise<TableInfo[]>;
  query(tableName: string, filters: Filter[], options?: QueryOptions): Promise<QueryResult>;
  trace?(identifier: string, value: string): Promise<TraceHop[]>;
  healthCheck?(): Promise<HealthStatus>;
  cleanup?(): Promise<void>;
}

export interface TableInfo {
  name: string;
  description?: string;
  columns: ColumnInfo[];
  rowCount?: number;
}

export interface ColumnInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  nullable?: boolean;
  description?: string;
}

export interface Filter {
  field: string;
  operator: string;
  value: any;
  secondValue?: any;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: OrderByClause[];
  columns?: string[];
}

export interface PluginConfig {
  [key: string]: any;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
  latency?: number;
}

// Configuration
export interface IQLConfig {
  plugins: PluginDefinition[];
  output: OutputConfig;
  cache?: CacheConfig;
  performance?: PerformanceConfig;
}

export interface PluginDefinition {
  name: string;
  enabled: boolean;
  config?: Record<string, any>;
}

export interface OutputConfig {
  format: 'json' | 'csv' | 'yaml' | 'table';
  maxRows?: number;
  pretty?: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
}

export interface PerformanceConfig {
  maxConcurrentQueries: number;
  queryTimeout: number;
}

// Error types
export class IQLError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'IQLError';
  }
}

export class ParseError extends IQLError {
  constructor(message: string, details?: any) {
    super(message, 'PARSE_ERROR', details);
    this.name = 'ParseError';
  }
}

export class ExecutionError extends IQLError {
  constructor(message: string, details?: any) {
    super(message, 'EXECUTION_ERROR', details);
    this.name = 'ExecutionError';
  }
}

export class PluginError extends IQLError {
  constructor(message: string, details?: any) {
    super(message, 'PLUGIN_ERROR', details);
    this.name = 'PluginError';
  }
}
