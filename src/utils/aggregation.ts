/**
 * Aggregation utilities for processing grouped data
 */

import { Column } from '../types';

export interface GroupedData {
  [groupKey: string]: Record<string, any>[];
}

/**
 * Groups rows by specified fields
 */
export function groupRows(rows: Record<string, any>[], groupByFields: string[]): GroupedData {
  const grouped: GroupedData = {};

  for (const row of rows) {
    // Create a composite key from group by fields
    const keyParts = groupByFields.map((field) => {
      const value = row[field];
      return value === null || value === undefined ? 'NULL' : String(value);
    });
    const groupKey = keyParts.join('|');

    if (!grouped[groupKey]) {
      grouped[groupKey] = [];
    }
    grouped[groupKey].push(row);
  }

  return grouped;
}

/**
 * Applies aggregate functions to grouped data
 */
export function applyAggregates(
  grouped: GroupedData,
  columns: Column[],
  groupByFields: string[]
): Record<string, any>[] {
  const results: Record<string, any>[] = [];

  for (const [groupKey, groupRows] of Object.entries(grouped)) {
    const result: Record<string, any> = {};

    // Extract group by field values from the first row
    const firstRow = groupRows[0];
    for (const field of groupByFields) {
      result[field] = firstRow[field];
    }

    // Apply aggregate functions
    for (const col of columns) {
      if (col.aggregate) {
        const aggValue = calculateAggregate(col.aggregate, col.name, groupRows);
        const resultKey = col.alias || `${col.aggregate.toLowerCase()}(${col.name})`;
        result[resultKey] = aggValue;
      } else if (!groupByFields.includes(col.name) && col.name !== '*') {
        // Non-aggregated, non-grouped columns use first value
        result[col.name] = firstRow[col.name];
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Calculates a single aggregate value
 */
export function calculateAggregate(
  aggregate: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX',
  fieldName: string,
  rows: Record<string, any>[]
): any {
  switch (aggregate) {
    case 'COUNT':
      if (fieldName === '*') {
        return rows.length;
      }
      return rows.filter((row) => row[fieldName] !== null && row[fieldName] !== undefined).length;

    case 'SUM': {
      let sum = 0;
      for (const row of rows) {
        const value = row[fieldName];
        if (typeof value === 'number') {
          sum += value;
        }
      }
      return sum;
    }

    case 'AVG': {
      let sum = 0;
      let count = 0;
      for (const row of rows) {
        const value = row[fieldName];
        if (typeof value === 'number') {
          sum += value;
          count++;
        }
      }
      return count > 0 ? sum / count : null;
    }

    case 'MIN': {
      let min: any = null;
      for (const row of rows) {
        const value = row[fieldName];
        if (value !== null && value !== undefined) {
          if (min === null || value < min) {
            min = value;
          }
        }
      }
      return min;
    }

    case 'MAX': {
      let max: any = null;
      for (const row of rows) {
        const value = row[fieldName];
        if (value !== null && value !== undefined) {
          if (max === null || value > max) {
            max = value;
          }
        }
      }
      return max;
    }

    default:
      throw new Error(`Unsupported aggregate function: ${aggregate}`);
  }
}

/**
 * Applies aggregates to all rows (when no GROUP BY is present)
 */
export function applyAggregatesWithoutGrouping(
  rows: Record<string, any>[],
  columns: Column[]
): Record<string, any>[] {
  const result: Record<string, any> = {};

  for (const col of columns) {
    if (col.aggregate) {
      const aggValue = calculateAggregate(col.aggregate, col.name, rows);
      const resultKey = col.alias || `${col.aggregate.toLowerCase()}(${col.name})`;
      result[resultKey] = aggValue;
    }
  }

  return [result];
}

/**
 * Filters aggregated results based on HAVING clause
 */
export function filterHaving(
  rows: Record<string, any>[],
  havingConditions: Array<{ field: string; operator: string; value: any }>
): Record<string, any>[] {
  return rows.filter((row) => {
    return havingConditions.every((condition) => {
      const rowValue = row[condition.field];
      
      switch (condition.operator) {
        case '=':
          return rowValue == condition.value;
        case '!=':
          return rowValue != condition.value;
        case '>':
          return rowValue > condition.value;
        case '<':
          return rowValue < condition.value;
        case '>=':
          return rowValue >= condition.value;
        case '<=':
          return rowValue <= condition.value;
        default:
          return true;
      }
    });
  });
}
