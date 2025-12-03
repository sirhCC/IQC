import { Parser } from '../src/parser/parser';
import { SelectStatement, TraceStatement, DescribeStatement, ShowStatement } from '../src/types';

describe('Parser', () => {
  describe('SELECT statements', () => {
    it('should parse SELECT * FROM table', () => {
      const parser = new Parser('SELECT * FROM services');
      const query = parser.parse();
      
      expect(query.type).toBe('SELECT');
      if (query.type === 'SELECT') {
        const stmt = query.statement as SelectStatement;
        expect(stmt.columns).toEqual([{ name: '*' }]);
        expect(stmt.from).toBe('services');
      }
    });
    
    it('should parse SELECT with specific columns', () => {
      const parser = new Parser('SELECT name, status FROM services');
      const query = parser.parse();
      
      expect(query.type).toBe('SELECT');
      if (query.type === 'SELECT') {
        const stmt = query.statement as SelectStatement;
        expect(stmt.columns).toEqual([
          { name: 'name' },
          { name: 'status' }
        ]);
      }
    });
    
    it('should parse SELECT with aliases', () => {
      const parser = new Parser('SELECT name AS service_name FROM services');
      const query = parser.parse();
      
      if (query.type === 'SELECT') {
        const stmt = query.statement as SelectStatement;
        expect(stmt.columns).toEqual([
          { name: 'name', alias: 'service_name' }
        ]);
      }
    });
    
    it('should parse SELECT with WHERE clause', () => {
      const parser = new Parser("SELECT * FROM services WHERE environment = 'production'");
      const query = parser.parse();
      
      if (query.type === 'SELECT') {
        const stmt = query.statement as SelectStatement;
        expect(stmt.where).toBeDefined();
        expect(stmt.where?.conditions).toHaveLength(1);
        expect(stmt.where?.conditions[0]).toEqual({
          field: 'environment',
          operator: '=',
          value: 'production'
        });
      }
    });
    
    it('should parse SELECT with multiple WHERE conditions', () => {
      const parser = new Parser(
        "SELECT * FROM services WHERE environment = 'production' AND status = 'running'"
      );
      const query = parser.parse();
      
      if (query.type === 'SELECT') {
        const stmt = query.statement as SelectStatement;
        expect(stmt.where?.conditions).toHaveLength(2);
        expect(stmt.where?.operator).toBe('AND');
      }
    });
    
    it('should parse SELECT with ORDER BY', () => {
      const parser = new Parser('SELECT * FROM services ORDER BY name ASC');
      const query = parser.parse();
      
      if (query.type === 'SELECT') {
        const stmt = query.statement as SelectStatement;
        expect(stmt.orderBy).toEqual([
          { field: 'name', direction: 'ASC' }
        ]);
      }
    });
    
    it('should parse SELECT with LIMIT and OFFSET', () => {
      const parser = new Parser('SELECT * FROM services LIMIT 10 OFFSET 5');
      const query = parser.parse();
      
      if (query.type === 'SELECT') {
        const stmt = query.statement as SelectStatement;
        expect(stmt.limit).toBe(10);
        expect(stmt.offset).toBe(5);
      }
    });
  });
  
  describe('TRACE statements', () => {
    it('should parse TRACE statement', () => {
      const parser = new Parser("TRACE service_id = 'svc-1' THROUGH mock");
      const query = parser.parse();
      
      expect(query.type).toBe('TRACE');
      if (query.type === 'TRACE') {
        const stmt = query.statement as TraceStatement;
        expect(stmt.identifier).toBe('service_id');
        expect(stmt.value).toBe('svc-1');
        expect(stmt.through).toEqual(['mock']);
      }
    });
    
    it('should parse TRACE with multiple sources', () => {
      const parser = new Parser("TRACE request_id = 'req-123' THROUGH aws, kubernetes, datadog");
      const query = parser.parse();
      
      if (query.type === 'TRACE') {
        const stmt = query.statement as TraceStatement;
        expect(stmt.through).toEqual(['aws', 'kubernetes', 'datadog']);
      }
    });
  });
  
  describe('DESCRIBE statements', () => {
    it('should parse DESCRIBE statement', () => {
      const parser = new Parser('DESCRIBE services');
      const query = parser.parse();
      
      expect(query.type).toBe('DESCRIBE');
      if (query.type === 'DESCRIBE') {
        const stmt = query.statement as DescribeStatement;
        expect(stmt.target).toBe('services');
      }
    });
  });
  
  describe('SHOW statements', () => {
    it('should parse SHOW TABLES', () => {
      const parser = new Parser('SHOW TABLES');
      const query = parser.parse();
      
      expect(query.type).toBe('SHOW');
      if (query.type === 'SHOW') {
        const stmt = query.statement as ShowStatement;
        expect(stmt.what).toBe('TABLES');
      }
    });
    
    it('should parse SHOW PLUGINS', () => {
      const parser = new Parser('SHOW PLUGINS');
      const query = parser.parse();
      
      expect(query.type).toBe('SHOW');
      if (query.type === 'SHOW') {
        const stmt = query.statement as ShowStatement;
        expect(stmt.what).toBe('PLUGINS');
      }
    });
  });
  
  describe('Error handling', () => {
    it('should throw error for invalid syntax', () => {
      const parser = new Parser('INVALID QUERY');
      
      expect(() => parser.parse()).toThrow();
    });
    
    it('should throw error for missing FROM', () => {
      const parser = new Parser('SELECT * WHERE name = test');
      
      expect(() => parser.parse()).toThrow();
    });
  });
});
