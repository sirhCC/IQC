/**
 * Lexer - Tokenizes IQL query strings
 */

export enum TokenType {
  // Keywords
  SELECT = 'SELECT',
  FROM = 'FROM',
  WHERE = 'WHERE',
  ORDER = 'ORDER',
  BY = 'BY',
  GROUP = 'GROUP',
  HAVING = 'HAVING',
  LIMIT = 'LIMIT',
  OFFSET = 'OFFSET',
  AND = 'AND',
  OR = 'OR',
  ASC = 'ASC',
  DESC = 'DESC',
  TRACE = 'TRACE',
  THROUGH = 'THROUGH',
  DESCRIBE = 'DESCRIBE',
  SHOW = 'SHOW',
  TABLES = 'TABLES',
  PLUGINS = 'PLUGINS',
  BETWEEN = 'BETWEEN',
  IN = 'IN',
  LIKE = 'LIKE',
  AS = 'AS',
  COUNT = 'COUNT',
  SUM = 'SUM',
  AVG = 'AVG',
  MIN = 'MIN',
  MAX = 'MAX',
  
  // Operators
  EQUALS = '=',
  NOT_EQUALS = '!=',
  GREATER = '>',
  LESS = '<',
  GREATER_EQUAL = '>=',
  LESS_EQUAL = '<=',
  
  // Literals
  IDENTIFIER = 'IDENTIFIER',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  
  // Punctuation
  COMMA = ',',
  DOT = '.',
  LPAREN = '(',
  RPAREN = ')',
  STAR = '*',
  
  // Special
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  position: number;
  line: number;
  column: number;
}

export class Lexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  
  private keywords: Map<string, TokenType> = new Map([
    ['SELECT', TokenType.SELECT],
    ['FROM', TokenType.FROM],
    ['WHERE', TokenType.WHERE],
    ['GROUP', TokenType.GROUP],
    ['HAVING', TokenType.HAVING],
    ['ORDER', TokenType.ORDER],
    ['BY', TokenType.BY],
    ['LIMIT', TokenType.LIMIT],
    ['OFFSET', TokenType.OFFSET],
    ['AND', TokenType.AND],
    ['OR', TokenType.OR],
    ['ASC', TokenType.ASC],
    ['DESC', TokenType.DESC],
    ['TRACE', TokenType.TRACE],
    ['THROUGH', TokenType.THROUGH],
    ['DESCRIBE', TokenType.DESCRIBE],
    ['SHOW', TokenType.SHOW],
    ['TABLES', TokenType.TABLES],
    ['PLUGINS', TokenType.PLUGINS],
    ['BETWEEN', TokenType.BETWEEN],
    ['IN', TokenType.IN],
    ['LIKE', TokenType.LIKE],
    ['AS', TokenType.AS],
    ['COUNT', TokenType.COUNT],
    ['SUM', TokenType.SUM],
    ['AVG', TokenType.AVG],
    ['MIN', TokenType.MIN],
    ['MAX', TokenType.MAX],
    ['TRUE', TokenType.BOOLEAN],
    ['FALSE', TokenType.BOOLEAN],
  ]);
  
  constructor(input: string) {
    this.input = input;
  }
  
  tokenize(): Token[] {
    const tokens: Token[] = [];
    
    while (this.position < this.input.length) {
      this.skipWhitespace();
      
      if (this.position >= this.input.length) break;
      
      const token = this.nextToken();
      if (token) {
        tokens.push(token);
      }
    }
    
    tokens.push({
      type: TokenType.EOF,
      value: '',
      position: this.position,
      line: this.line,
      column: this.column,
    });
    
    return tokens;
  }
  
  private nextToken(): Token | null {
    const char = this.input[this.position];
    
    const singleChar: Record<string, TokenType> = {
      ',': TokenType.COMMA,
      '.': TokenType.DOT,
      '(': TokenType.LPAREN,
      ')': TokenType.RPAREN,
      '*': TokenType.STAR,
    };
    
    if (singleChar[char]) {
      return this.makeToken(singleChar[char], char, 1);
    }
    
    if (char === '=') {
      return this.makeToken(TokenType.EQUALS, char, 1);
    }
    
    if (char === '!' && this.peek() === '=') {
      return this.makeToken(TokenType.NOT_EQUALS, '!=', 2);
    }
    
    if (char === '>') {
      if (this.peek() === '=') {
        return this.makeToken(TokenType.GREATER_EQUAL, '>=', 2);
      }
      return this.makeToken(TokenType.GREATER, char, 1);
    }
    
    if (char === '<') {
      if (this.peek() === '=') {
        return this.makeToken(TokenType.LESS_EQUAL, '<=', 2);
      }
      return this.makeToken(TokenType.LESS, char, 1);
    }
    
    if (char === "'" || char === '"') {
      return this.readString(char);
    }
    
    if (this.isDigit(char)) {
      return this.readNumber();
    }
    
    if (this.isAlpha(char) || char === '_') {
      return this.readIdentifier();
    }
    
    if (char === '-' && this.peek() === '-') {
      this.skipComment();
      return null;
    }
    
    throw new Error(`Unexpected character '${char}' at line ${this.line}, column ${this.column}`);
  }
  
  private readString(quote: string): Token {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;
    
    this.advance();
    
    let value = '';
    while (this.position < this.input.length && this.input[this.position] !== quote) {
      if (this.input[this.position] === '\\' && this.position + 1 < this.input.length) {
        this.advance();
        value += this.input[this.position];
      } else {
        value += this.input[this.position];
      }
      this.advance();
    }
    
    if (this.position >= this.input.length) {
      throw new Error(`Unterminated string at line ${startLine}, column ${startColumn}`);
    }
    
    this.advance();
    
    return {
      type: TokenType.STRING,
      value,
      position: start,
      line: startLine,
      column: startColumn,
    };
  }
  
  private readNumber(): Token {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;
    
    let value = '';
    while (this.position < this.input.length && 
           (this.isDigit(this.input[this.position]) || this.input[this.position] === '.')) {
      value += this.input[this.position];
      this.advance();
    }
    
    return {
      type: TokenType.NUMBER,
      value,
      position: start,
      line: startLine,
      column: startColumn,
    };
  }
  
  private readIdentifier(): Token {
    const start = this.position;
    const startLine = this.line;
    const startColumn = this.column;
    
    let value = '';
    while (this.position < this.input.length && 
           (this.isAlphaNumeric(this.input[this.position]) || this.input[this.position] === '_')) {
      value += this.input[this.position];
      this.advance();
    }
    
    const upperValue = value.toUpperCase();
    const type = this.keywords.get(upperValue) || TokenType.IDENTIFIER;
    
    return {
      type,
      value: type === TokenType.IDENTIFIER ? value : upperValue,
      position: start,
      line: startLine,
      column: startColumn,
    };
  }
  
  private skipWhitespace(): void {
    while (this.position < this.input.length && 
           /\s/.test(this.input[this.position])) {
      if (this.input[this.position] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }
  }
  
  private skipComment(): void {
    while (this.position < this.input.length && this.input[this.position] !== '\n') {
      this.advance();
    }
  }
  
  private makeToken(type: TokenType, value: string, length: number): Token {
    const token: Token = {
      type,
      value,
      position: this.position,
      line: this.line,
      column: this.column,
    };
    
    for (let i = 0; i < length; i++) {
      this.advance();
    }
    
    return token;
  }
  
  private advance(): void {
    this.position++;
    this.column++;
  }
  
  private peek(offset: number = 1): string {
    const pos = this.position + offset;
    return pos < this.input.length ? this.input[pos] : '';
  }
  
  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }
  
  private isAlpha(char: string): boolean {
    return /[a-zA-Z]/.test(char);
  }
  
  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}
