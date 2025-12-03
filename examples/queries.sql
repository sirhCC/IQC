# Example Queries

## Basic Queries

### List all services
```sql
SELECT * FROM services;
```

### Filter by environment
```sql
SELECT name, version, status 
FROM services 
WHERE environment = 'production';
```

### Find high CPU usage
```sql
SELECT name, cpu_usage, memory_usage 
FROM services 
WHERE cpu_usage > 50 
ORDER BY cpu_usage DESC;
```

## Deployments

### Recent successful deployments
```sql
SELECT service_id, version, deployed_by, timestamp
FROM deployments
WHERE status = 'success' AND timestamp > '2024-01-01'
ORDER BY timestamp DESC
LIMIT 10;
```

### Failed deployments by user
```sql
SELECT service_id, version, deployed_by
FROM deployments
WHERE status = 'failed' AND deployed_by = 'user@example.com';
```

## Incidents

### Open critical incidents
```sql
SELECT id, service_id, description, created_at
FROM incidents
WHERE severity = 'critical' AND status = 'open'
ORDER BY created_at DESC;
```

### Incidents for a specific service
```sql
SELECT severity, description, status, created_at
FROM incidents
WHERE service_id = 'svc-1';
```

## Tracing

### Trace a service across all sources
```sql
TRACE service_id = 'svc-1' THROUGH mock;
```

## Schema Exploration

### Describe services table
```sql
DESCRIBE services;
```

### List all available tables
```sql
SHOW TABLES;
```

### List all plugins
```sql
SHOW PLUGINS;
```

## Advanced Queries

### Services with aliases
```sql
SELECT 
  name AS service_name,
  status AS health_status,
  cpu_usage AS cpu_percent
FROM services
WHERE environment = 'production';
```

### Pagination
```sql
SELECT * FROM services
ORDER BY name
LIMIT 5 OFFSET 0;
```

### Multiple conditions
```sql
SELECT name, environment, status
FROM services
WHERE 
  (environment = 'production' OR environment = 'staging')
  AND status = 'running'
  AND cpu_usage < 80;
```
