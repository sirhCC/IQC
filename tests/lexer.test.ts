import { Lexer, TokenType } from '../src/parser/lexer';

describe('Lexer', () => {
  it('should tokenize SELECT statement', () => {
    const lexer = new Lexer('SELECT * FROM services');
    const tokens = lexer.tokenize();
    
    expect(tokens).toHaveLength(5); // SELECT, *, FROM, services, EOF
    expect(tokens[0].type).toBe(TokenType.SELECT);
    expect(tokens[1].type).toBe(TokenType.STAR);
    expect(tokens[2].type).toBe(TokenType.FROM);
    expect(tokens[3].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[3].value).toBe('services');
    expect(tokens[4].type).toBe(TokenType.EOF);
  });
  
  it('should tokenize string literals', () => {
    const lexer = new Lexer("WHERE name = 'test'");
    const tokens = lexer.tokenize();
    
    const stringToken = tokens.find(t => t.type === TokenType.STRING);
    expect(stringToken).toBeDefined();
    expect(stringToken?.value).toBe('test');
  });
  
  it('should tokenize number literals', () => {
    const lexer = new Lexer('WHERE count > 42');
    const tokens = lexer.tokenize();
    
    const numberToken = tokens.find(t => t.type === TokenType.NUMBER);
    expect(numberToken).toBeDefined();
    expect(numberToken?.value).toBe('42');
  });
  
  it('should tokenize operators', () => {
    const lexer = new Lexer('a = b AND c != d');
    const tokens = lexer.tokenize();
    
    expect(tokens.find(t => t.type === TokenType.EQUALS)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.AND)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.NOT_EQUALS)).toBeDefined();
  });
  
  it('should handle comments', () => {
    const lexer = new Lexer('SELECT * -- this is a comment\nFROM services');
    const tokens = lexer.tokenize();
    
    // Comments should be skipped
    expect(tokens.find(t => t.value.includes('comment'))).toBeUndefined();
    expect(tokens.find(t => t.type === TokenType.SELECT)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.FROM)).toBeDefined();
  });
  
  it('should track line and column positions', () => {
    const lexer = new Lexer('SELECT\n*\nFROM services');
    const tokens = lexer.tokenize();
    
    expect(tokens[0].line).toBe(1);
    expect(tokens[1].line).toBe(2);
    expect(tokens[2].line).toBe(3);
  });
});
