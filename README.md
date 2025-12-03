# Infrastructure Query Language (IQL)

> SQL for DevOps Infrastructure - Query your clouds, clusters, and CI/CD pipelines with familiar SQL syntax

## 🚀 Overview

IQL (Infrastructure Query Language) is a powerful CLI tool that lets you query your entire DevOps infrastructure using SQL-like syntax. Instead of juggling multiple tools and APIs, unify access to AWS, Kubernetes, CI/CD pipelines, secrets managers, and more through a single query interface.

## ✨ Features

- 🔍 **SQL-Like Syntax** - Familiar SELECT, WHERE, ORDER BY, and more
- 🔌 **Plugin Architecture** - Extensible data source system
- 🌐 **Multi-Source Queries** - Query across different infrastructure providers
- 🔗 **Trace Operations** - Follow resources across your entire stack
- 📊 **Multiple Output Formats** - Table, JSON, CSV, YAML
- ⚡ **Interactive REPL** - Explore your infrastructure interactively
- 🎯 **Type-Safe** - Built with TypeScript for reliability

## 📦 Installation

```bash
npm install -g iql
```

Or use locally:

```bash
git clone https://github.com/yourusername/iql.git
cd iql
npm install
npm run build
npm link
```

## 🎯 Quick Start

### Interactive Mode

```bash
iql
```

This starts an interactive shell where you can run queries:

```sql
iql> SELECT * FROM services WHERE environment = 'production'
iql> TRACE service_id = 'svc-123' THROUGH aws, kubernetes
iql> DESCRIBE services
iql> SHOW TABLES
```

### Execute from File

```bash
iql -f queries.sql -o json
```

## 📖 Query Syntax

### SELECT - Query Data

```sql
-- Basic query
SELECT * FROM services

-- With filters
SELECT name, status FROM services WHERE environment = 'production'

-- With operators
SELECT * FROM deployments WHERE timestamp > '2024-01-01' AND status = 'success'

-- With sorting and pagination
SELECT * FROM incidents 
WHERE severity = 'critical' 
ORDER BY created_at DESC 
LIMIT 10

-- Column aliases
SELECT name AS service_name, status AS health FROM services
```

### Supported Operators

- `=`, `!=` - Equality/inequality
- `>`, `<`, `>=`, `<=` - Comparison
- `LIKE` - String matching
- `IN` - List membership
- `BETWEEN` - Range queries
- `AND`, `OR` - Logical operators

### TRACE - Follow Resources

Track a resource across your entire infrastructure:

```sql
TRACE service_id = 'api-gateway' THROUGH aws, kubernetes, datadog
```

This returns a timeline of all related events and resources.

### DESCRIBE - Inspect Schema

View table structure and available columns:

```sql
DESCRIBE services
```

### SHOW - List Resources

```sql
SHOW TABLES    -- List all available tables
SHOW PLUGINS   -- List registered data sources
SHOW SOURCES   -- Alias for SHOW PLUGINS
```

## 🔌 Plugins

IQL uses a plugin system to connect to different data sources.

### Built-in Plugins

- **Mock Plugin** - Sample data for testing (always available)
- **AWS Plugin** - Query EC2 instances, RDS databases, Lambda functions (requires credentials)

### Creating Custom Plugins

```typescript
import { DataSourcePlugin } from 'iql';

export class MyPlugin implements DataSourcePlugin {
  name = 'my-plugin';
  version = '1.0.0';
  description = 'My custom data source';
  
  async initialize(config: PluginConfig): Promise<void> {
    // Connect to your data source
  }
  
  async getTables(): Promise<TableInfo[]> {
    // Return available tables
    return [
      {
        name: 'my_table',
        columns: [
          { name: 'id', type: 'string' },
          { name: 'value', type: 'number' }
        ]
      }
    ];
  }
  
  async query(
    tableName: string,
    filters: Filter[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    // Execute query and return results
  }
  
  async trace(identifier: string, value: string): Promise<TraceHop[]> {
    // Optional: Implement tracing
    return [];
  }
  
  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true };
  }
}
```

### Plugin Configuration

Create an `iql.config.yaml`:

```yaml
plugins:
  - name: aws
    path: ./plugins/aws-plugin
    config:
      region: us-east-1
      profile: default
      
  - name: kubernetes
    path: ./plugins/k8s-plugin
    config:
      context: production
      namespace: default
```

## 🎨 Output Formats

### Table (Default)

```bash
iql -o table
```

Clean, formatted tables in your terminal.

### JSON

```bash
iql -o json
```

Machine-readable JSON output.

### CSV

```bash
iql -o csv > results.csv
```

Export to CSV for spreadsheets.

### YAML

```bash
iql -o yaml
```

YAML format for configuration-style output.

## 🛠️ Development

### Project Structure

```
iql/
├── src/
│   ├── types/          # TypeScript interfaces
│   ├── parser/         # Lexer & Parser
│   ├── engine/         # Query executor
│   ├── plugins/        # Plugin system
│   │   ├── mock-plugin.ts
│   │   └── plugin-manager.ts
│   ├── cli.ts          # CLI interface
│   └── index.ts        # Main exports
├── tests/              # Jest tests
├── examples/           # Example queries & plugins
└── docs/               # Documentation
```

### Build

```bash
npm run build       # Compile TypeScript
npm run dev         # Watch mode
npm run type-check  # Type checking only
```

### Testing

```bash
npm test            # Run tests
npm run test:watch  # Watch mode
npm run test:coverage  # With coverage
```

### Linting & Formatting

```bash
npm run lint        # ESLint
npm run format      # Prettier
```

## 🤝 Contributing

Contributions welcome! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Plugin Development

Want to create a plugin for your favorite service? Check out the [Plugin Development Guide](docs/plugin-development.md).

## 📝 Examples

### Query AWS EC2 Instances

```sql
SELECT instance_id, state, instance_type 
FROM ec2_instances 
WHERE state = 'running' AND tags.environment = 'production'
```

### Find Failed Deployments

```sql
SELECT service, version, deployed_by, timestamp
FROM deployments
WHERE status = 'failed' AND timestamp > '2024-01-01'
ORDER BY timestamp DESC
```

### Trace a Request ID

```sql
TRACE request_id = 'req-abc123' THROUGH aws, datadog, sentry
```

### Check Service Health

```sql
SELECT name, status, cpu_usage, memory_usage
FROM services
WHERE status != 'running' OR cpu_usage > 80
```

## 🗺️ Roadmap

- [ ] AWS Plugin (EC2, RDS, Lambda, S3)
- [ ] Kubernetes Plugin
- [ ] GitHub Actions Plugin
- [ ] CircleCI Plugin
- [ ] Datadog Plugin
- [ ] PagerDuty Plugin
- [ ] Vault/Secrets Manager Plugin
- [ ] JOIN operations across data sources
- [ ] Aggregation functions (COUNT, SUM, AVG)
- [ ] Subqueries
- [ ] Query result caching
- [ ] Web UI dashboard

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built to unify DevOps tooling inspired by:
- SQL's simplicity and power
- The pain of juggling multiple infrastructure tools
- The need for a single pane of glass across clouds and services