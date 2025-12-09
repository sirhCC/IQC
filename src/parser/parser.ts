/**
 * Parser - Converts tokens into an Abstract Syntax Tree (AST)
 */

import { Lexer, Token, TokenType } from './lexer';
import {
  Query,
  SelectStatement,
  TraceStatement,
  DescribeStatement,
  ShowStatement,
  Column,
  WhereClause,
  Condition,
  OrderByClause,
  JoinClause,
  ParseError,
} from '../types';

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(input: string) {
    const lexer = new Lexer(input);
    this.tokens = lexer.tokenize();
  }

  parse(): Query {
    const token = this.peek();

    switch (token.type) {
      case TokenType.SELECT:
        return { type: 'SELECT', statement: this.parseSelect() };
      case TokenType.TRACE:
        return { type: 'TRACE', statement: this.parseTrace() };
      case TokenType.DESCRIBE:
        return { type: 'DESCRIBE', statement: this.parseDescribe() };
      case TokenType.SHOW:
        if (this.tokens[this.current + 1]?.type === TokenType.CACHE) {
          return { type: 'CACHE', statement: this.parseCacheCommand() };
        }
        return { type: 'SHOW', statement: this.parseShow() };
      case TokenType.CLEAR:
        return { type: 'CACHE', statement: this.parseCacheCommand() };
      case TokenType.SET:
        return { type: 'CACHE', statement: this.parseCacheCommand() };
      default:
        throw new ParseError(
          `Unexpected token: ${token.value}. Expected SELECT, TRACE, DESCRIBE, SHOW, CLEAR, or SET`,
          { token }
        );
    }
  }

  private parseSelect(): SelectStatement {
    this.consume(TokenType.SELECT, 'Expected SELECT');

    const columns = this.parseColumns();

    this.consume(TokenType.FROM, 'Expected FROM');
    const from = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;

    let joins: JoinClause[] | undefined;
    if (
      this.check(TokenType.INNER) ||
      this.check(TokenType.LEFT) ||
      this.check(TokenType.RIGHT) ||
      this.check(TokenType.JOIN)
    ) {
      joins = this.parseJoins();
    }

    let where: WhereClause | undefined;
    if (this.match(TokenType.WHERE)) {
      where = this.parseWhere();
    }

    let groupBy: string[] | undefined;
    if (this.match(TokenType.GROUP)) {
      this.consume(TokenType.BY, 'Expected BY after GROUP');
      groupBy = this.parseGroupBy();
    }

    let having: WhereClause | undefined;
    if (this.match(TokenType.HAVING)) {
      having = this.parseWhere();
    }

    let orderBy: OrderByClause[] | undefined;
    if (this.match(TokenType.ORDER)) {
      this.consume(TokenType.BY, 'Expected BY after ORDER');
      orderBy = this.parseOrderBy();
    }

    let limit: number | undefined;
    if (this.match(TokenType.LIMIT)) {
      const limitToken = this.consume(TokenType.NUMBER, 'Expected number after LIMIT');
      limit = parseInt(limitToken.value);
    }

    let offset: number | undefined;
    if (this.match(TokenType.OFFSET)) {
      const offsetToken = this.consume(TokenType.NUMBER, 'Expected number after OFFSET');
      offset = parseInt(offsetToken.value);
    }

    return { columns, from, joins, where, groupBy, having, orderBy, limit, offset };
  }

  private parseColumns(): Column[] {
    if (this.match(TokenType.STAR)) {
      return [{ name: '*' }];
    }

    const columns: Column[] = [];

    do {
      let aggregate: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | undefined;
      let name: string;

      // Check for aggregate functions
      if (
        this.check(TokenType.COUNT) ||
        this.check(TokenType.SUM) ||
        this.check(TokenType.AVG) ||
        this.check(TokenType.MIN) ||
        this.check(TokenType.MAX)
      ) {
        const aggToken = this.advance();
        aggregate = aggToken.value.toUpperCase() as 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

        this.consume(TokenType.LPAREN, 'Expected ( after aggregate function');

        if (this.match(TokenType.STAR)) {
          name = '*';
        } else {
          name = this.consume(TokenType.IDENTIFIER, 'Expected column name or *').value;
        }

        this.consume(TokenType.RPAREN, 'Expected ) after aggregate function');
      } else {
        name = this.consume(TokenType.IDENTIFIER, 'Expected column name').value;
        // Handle qualified names (table.column)
        if (this.match(TokenType.DOT)) {
          const columnName = this.consume(
            TokenType.IDENTIFIER,
            'Expected column name after dot'
          ).value;
          name = `${name}.${columnName}`;
        }
      }

      let alias: string | undefined;
      if (this.match(TokenType.AS)) {
        // Allow aggregate keywords as alias names (e.g., "as count")
        const aliasToken = this.peek();
        if (
          aliasToken.type === TokenType.IDENTIFIER ||
          aliasToken.type === TokenType.COUNT ||
          aliasToken.type === TokenType.SUM ||
          aliasToken.type === TokenType.AVG ||
          aliasToken.type === TokenType.MIN ||
          aliasToken.type === TokenType.MAX
        ) {
          alias = this.advance().value.toLowerCase();
        } else {
          throw new ParseError(
            `Expected alias name at line ${aliasToken.line}, column ${aliasToken.column}`,
            { token: aliasToken }
          );
        }
      }

      columns.push({ name, alias, aggregate });
    } while (this.match(TokenType.COMMA));

    return columns;
  }

  private parseWhere(): WhereClause {
    const conditions: Condition[] = [];
    let operator: 'AND' | 'OR' = 'AND';

    do {
      // Allow aggregate keywords as field names (for HAVING clauses referencing aliases)
      const fieldToken = this.peek();
      let field: string;
      if (
        fieldToken.type === TokenType.IDENTIFIER ||
        fieldToken.type === TokenType.COUNT ||
        fieldToken.type === TokenType.SUM ||
        fieldToken.type === TokenType.AVG ||
        fieldToken.type === TokenType.MIN ||
        fieldToken.type === TokenType.MAX
      ) {
        field = this.advance().value.toLowerCase();
        // Handle qualified names (table.column)
        if (this.match(TokenType.DOT)) {
          const columnName = this.consume(
            TokenType.IDENTIFIER,
            'Expected column name after dot'
          ).value;
          field = `${field}.${columnName}`;
        }
      } else {
        throw new ParseError(
          `Expected field name at line ${fieldToken.line}, column ${fieldToken.column}`,
          { token: fieldToken }
        );
      }

      let op: string;
      const opToken = this.peek();

      if (opToken.type === TokenType.BETWEEN) {
        this.advance();
        const value1Token = this.advance();
        this.consume(TokenType.AND, 'Expected AND in BETWEEN clause');
        const value2Token = this.advance();

        conditions.push({
          field,
          operator: 'BETWEEN',
          value: this.parseValue(value1Token),
          secondValue: this.parseValue(value2Token),
        });
        continue;
      } else if (opToken.type === TokenType.IN) {
        this.advance();
        this.consume(TokenType.LPAREN, 'Expected ( after IN');
        const values: any[] = [];

        do {
          values.push(this.parseValue(this.advance()));
        } while (this.match(TokenType.COMMA));

        this.consume(TokenType.RPAREN, 'Expected ) after IN values');

        conditions.push({
          field,
          operator: 'IN',
          value: values,
        });
        continue;
      }

      if (this.match(TokenType.EQUALS)) op = '=';
      else if (this.match(TokenType.NOT_EQUALS)) op = '!=';
      else if (this.match(TokenType.GREATER_EQUAL)) op = '>=';
      else if (this.match(TokenType.LESS_EQUAL)) op = '<=';
      else if (this.match(TokenType.GREATER)) op = '>';
      else if (this.match(TokenType.LESS)) op = '<';
      else if (this.match(TokenType.LIKE)) op = 'LIKE';
      else {
        throw new ParseError(`Expected comparison operator, got ${opToken.value}`, {
          token: opToken,
        });
      }

      const valueToken = this.advance();
      const value = this.parseValue(valueToken);

      conditions.push({ field, operator: op as any, value });

      if (this.match(TokenType.AND)) {
        operator = 'AND';
      } else if (this.match(TokenType.OR)) {
        operator = 'OR';
      } else {
        break;
      }
    } while (true);

    return { conditions, operator };
  }

  private parseGroupBy(): string[] {
    const groupBy: string[] = [];

    do {
      const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
      groupBy.push(field);
    } while (this.match(TokenType.COMMA));

    return groupBy;
  }

  private parseOrderBy(): OrderByClause[] {
    const orderBy: OrderByClause[] = [];

    do {
      const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
      let direction: 'ASC' | 'DESC' = 'ASC';

      if (this.match(TokenType.ASC)) {
        direction = 'ASC';
      } else if (this.match(TokenType.DESC)) {
        direction = 'DESC';
      }

      orderBy.push({ field, direction });
    } while (this.match(TokenType.COMMA));

    return orderBy;
  }

  private parseTrace(): TraceStatement {
    this.consume(TokenType.TRACE, 'Expected TRACE');

    const identifier = this.consume(TokenType.IDENTIFIER, 'Expected identifier').value;
    this.consume(TokenType.EQUALS, 'Expected =');

    const valueToken = this.advance();
    const value = this.parseValue(valueToken);

    this.consume(TokenType.THROUGH, 'Expected THROUGH');

    const through: string[] = [];
    do {
      through.push(this.consume(TokenType.IDENTIFIER, 'Expected data source name').value);
    } while (this.match(TokenType.COMMA));

    return { identifier, value: String(value), through };
  }

  private parseDescribe(): DescribeStatement {
    this.consume(TokenType.DESCRIBE, 'Expected DESCRIBE');
    const target = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;
    return { target };
  }

  private parseShow(): ShowStatement {
    this.consume(TokenType.SHOW, 'Expected SHOW');

    const token = this.peek();
    let what: 'TABLES' | 'PLUGINS' | 'SOURCES';

    if (token.type === TokenType.TABLES) {
      this.advance();
      what = 'TABLES';
    } else if (token.type === TokenType.PLUGINS) {
      this.advance();
      what = 'PLUGINS';
    } else if (token.value.toUpperCase() === 'SOURCES') {
      this.advance();
      what = 'SOURCES';
    } else {
      throw new ParseError(`Expected TABLES, PLUGINS, or SOURCES after SHOW`, { token });
    }

    return { what };
  }

  private parseCacheCommand(): import('../types').CacheStatement {
    const token = this.peek();

    // SHOW CACHE
    if (token.type === TokenType.SHOW) {
      this.advance();
      this.consume(TokenType.CACHE, 'Expected CACHE after SHOW');
      return { action: 'SHOW' };
    }

    // CLEAR CACHE [table_name]
    if (token.type === TokenType.CLEAR) {
      this.advance();
      this.consume(TokenType.CACHE, 'Expected CACHE after CLEAR');
      let table: string | undefined;
      if (this.check(TokenType.IDENTIFIER)) {
        table = this.advance().value;
      }
      return { action: 'CLEAR', table };
    }

    // SET CACHE TTL table_name = milliseconds
    if (token.type === TokenType.SET) {
      this.advance();
      this.consume(TokenType.CACHE, 'Expected CACHE after SET');
      this.consume(TokenType.TTL, 'Expected TTL after CACHE');
      const table = this.consume(TokenType.IDENTIFIER, 'Expected table name').value;
      this.consume(TokenType.EQUALS, 'Expected = after table name');
      const ttlToken = this.consume(TokenType.NUMBER, 'Expected TTL value in milliseconds');
      const ttl = parseInt(ttlToken.value);
      return { action: 'SET_TTL', table, ttl };
    }

    throw new ParseError(`Invalid cache command`, { token });
  }

  private parseJoins(): JoinClause[] {
    const joins: JoinClause[] = [];

    while (
      this.check(TokenType.INNER) ||
      this.check(TokenType.LEFT) ||
      this.check(TokenType.RIGHT) ||
      this.check(TokenType.JOIN)
    ) {
      let joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'OUTER' = 'INNER';

      if (this.match(TokenType.INNER)) {
        this.consume(TokenType.JOIN, 'Expected JOIN after INNER');
        joinType = 'INNER';
      } else if (this.match(TokenType.LEFT)) {
        this.match(TokenType.OUTER); // Optional OUTER keyword
        this.consume(TokenType.JOIN, 'Expected JOIN after LEFT');
        joinType = 'LEFT';
      } else if (this.match(TokenType.RIGHT)) {
        this.match(TokenType.OUTER); // Optional OUTER keyword
        this.consume(TokenType.JOIN, 'Expected JOIN after RIGHT');
        joinType = 'RIGHT';
      } else {
        this.consume(TokenType.JOIN, 'Expected JOIN');
        joinType = 'INNER'; // Default to INNER JOIN
      }

      const table = this.consume(TokenType.IDENTIFIER, 'Expected table name after JOIN').value;

      this.consume(TokenType.ON, 'Expected ON after JOIN table');

      // Parse left field (may be qualified with table name: table.column)
      let leftField = this.consume(TokenType.IDENTIFIER, 'Expected field name after ON').value;
      if (this.match(TokenType.DOT)) {
        const columnName = this.consume(
          TokenType.IDENTIFIER,
          'Expected column name after dot'
        ).value;
        leftField = `${leftField}.${columnName}`;
      }

      let operator: '=' | '!=' | '>' | '<' | '>=' | '<=' = '=';
      if (this.match(TokenType.EQUALS)) operator = '=';
      else if (this.match(TokenType.NOT_EQUALS)) operator = '!=';
      else if (this.match(TokenType.GREATER_EQUAL)) operator = '>=';
      else if (this.match(TokenType.LESS_EQUAL)) operator = '<=';
      else if (this.match(TokenType.GREATER)) operator = '>';
      else if (this.match(TokenType.LESS)) operator = '<';
      else
        throw new ParseError('Expected comparison operator in JOIN ON clause', {
          token: this.peek(),
        });

      // Parse right field (may be qualified with table name: table.column)
      let rightField = this.consume(
        TokenType.IDENTIFIER,
        'Expected field name after operator'
      ).value;
      if (this.match(TokenType.DOT)) {
        const columnName = this.consume(
          TokenType.IDENTIFIER,
          'Expected column name after dot'
        ).value;
        rightField = `${rightField}.${columnName}`;
      }

      joins.push({
        type: joinType,
        table,
        on: { leftField, operator, rightField },
      });
    }

    return joins;
  }

  private parseValue(token: Token): any {
    switch (token.type) {
      case TokenType.STRING:
        return token.value;
      case TokenType.NUMBER:
        return token.value.includes('.') ? parseFloat(token.value) : parseInt(token.value);
      case TokenType.BOOLEAN:
        return token.value.toUpperCase() === 'TRUE';
      case TokenType.IDENTIFIER:
        return token.value;
      default:
        throw new ParseError(`Unexpected value token: ${token.value}`, { token });
    }
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();

    const token = this.peek();
    throw new ParseError(`${message} at line ${token.line}, column ${token.column}`, { token });
  }
}
