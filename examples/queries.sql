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

## JOIN Queries

### Services with their deployments (INNER JOIN)
```sql
SELECT 
  services.name,
  services.version,
  deployments.deployed_by,
  deployments.timestamp
FROM services
INNER JOIN deployments ON services.id = deployments.service_id
WHERE services.environment = 'production'
ORDER BY deployments.timestamp DESC;
```

### All services with their deployments if any (LEFT JOIN)
```sql
SELECT 
  services.name,
  services.status,
  deployments.version,
  deployments.timestamp
FROM services
LEFT JOIN deployments ON services.id = deployments.service_id
ORDER BY services.name;
```

### Services with incidents (correlation analysis)
```sql
SELECT 
  services.name,
  services.environment,
  incidents.severity,
  incidents.description,
  incidents.created_at
FROM services
INNER JOIN incidents ON services.id = incidents.service_id
WHERE incidents.status = 'open'
ORDER BY incidents.severity DESC, incidents.created_at DESC;
```

### Multiple JOINs - Full service correlation
```sql
SELECT 
  services.name,
  services.cpu_usage,
  deployments.version,
  deployments.timestamp AS last_deployed,
  incidents.severity,
  incidents.status AS incident_status
FROM services
INNER JOIN deployments ON services.id = deployments.service_id
LEFT JOIN incidents ON services.id = incidents.service_id
WHERE services.environment = 'production'
ORDER BY services.name, deployments.timestamp DESC;
```

### Find services with failed deployments
```sql
SELECT 
  services.name,
  services.environment,
  deployments.version,
  deployments.deployed_by
FROM services
INNER JOIN deployments ON services.id = deployments.service_id
WHERE deployments.status = 'failed'
ORDER BY deployments.timestamp DESC;
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
