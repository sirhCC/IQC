# IQL Development Roadmap

**Project Status:** Early prototype - functional parser and mock data, but not production-ready.

## 🔴 Critical Priority (Blockers for Real Use)

### 1. Implement Real Data Source Plugins
**Status:** ✅ Partially Complete  
**Effort:** High  
**Impact:** Critical

AWS plugin implemented with EC2, RDS, Lambda support. Kubernetes and Docker plugins scaffolded but need npm packages.

- **AWS Plugin** (highest demand)
  - EC2 instances (running, stopped, instance types, tags)
  - RDS databases (status, size, connections)
  - Lambda functions (runtime, memory, last invocation)
  - S3 buckets (size, versioning, encryption)
  - IAM users/roles/policies
  - ECS/EKS clusters
  
- **Kubernetes Plugin**
  - Pods (status, restarts, resource usage)
  - Deployments (replicas, images, status)
  - Services (type, ports, selectors)
  - ConfigMaps and Secrets (metadata only)
  - Namespaces
  - Nodes (capacity, allocations)

- **Docker Plugin**
  - Containers (status, images, ports)
  - Images (size, tags, created date)
  - Volumes
  - Networks

**Dependencies:** Auth/credentials management, error handling

---

### 2. Add Authentication/Credentials Management
**Status:** ✅ Partially Complete  
**Effort:** Medium  
**Impact:** Critical

AWS credentials working (env vars, profiles, default chain). Need K8s contexts, Docker, credential validation.

- Environment variables (AWS_ACCESS_KEY_ID, etc.)
- Config file credentials sections
- AWS profiles (~/.aws/credentials)
- Kubernetes contexts (~/.kube/config)
- Service account tokens
- OAuth for APIs (GitHub, etc.)
- Secure credential storage (OS keychain integration?)

**Security Requirements:**
- Never log credentials
- Support credential rotation
- Validate permissions before queries
- Support assume-role for AWS

---

### 3. Fix YAML Config Parsing
**Status:** ✅ Complete  
**Effort:** Low  
**Impact:** High

YAML config parsing implemented with env var substitution and plugin loading. Need to:

- Actually parse `iql.config.yaml` using the yaml package
- Load plugin configurations from config
- Support environment variable substitution in config
- Validate config schema
- Handle missing/invalid config gracefully

**Example Config Structure:**
```yaml
plugins:
  - name: aws
    enabled: true
    config:
      region: ${AWS_REGION:-us-east-1}
      profile: default
      
  - name: kubernetes
    enabled: true
    config:
      context: production
      namespace: default

output:
  format: table
  color: true
  maxRows: 1000
```

---

### 4. Add Proper Error Handling & Logging
**Status:** ✅ Complete  
**Effort:** Medium  
**Impact:** High

Winston logging integrated with structured logs, retry logic with exponential backoff, timeout handling. Production ready:

- Structured logging (Winston or Pino)
- Log levels (debug, info, warn, error)
- Connection retry logic with exponential backoff
- Timeout handling for slow queries
- Graceful degradation (continue if one plugin fails)
- Error context (which query, which plugin, which resource)
- User-friendly error messages
- Debug mode for troubleshooting

---

## 🟡 High Priority (Essential for Production)

### 5. Add Aggregation Functions
**Status:** ✅ Complete  
**Effort:** Medium  
**Impact:** High

All aggregation functions implemented (COUNT, SUM, AVG, MIN, MAX, GROUP BY, HAVING). Fully functional:

- `COUNT(*)`/`COUNT(column)` - count resources
- `SUM(column)` - total costs, sizes, etc.
- `AVG(column)` - average CPU, memory
- `MIN(column)` / `MAX(column)` - find extremes
- `GROUP BY` - group by region, environment, status
- `HAVING` - filter after aggregation

**Example Queries:**
```sql
SELECT region, COUNT(*) as instance_count 
FROM ec2_instances 
GROUP BY region;

SELECT environment, AVG(cpu_usage) as avg_cpu
FROM services
GROUP BY environment
HAVING avg_cpu > 50;
```

**Parser Changes:** Add GROUP BY, HAVING tokens/parsing  
**Executor Changes:** Implement aggregation logic, grouping

---

### 6. Implement JOIN Operations
**Status:** Not Started  
**Effort:** High  
**Impact:** High

Critical for correlating infrastructure data across sources:

- `INNER JOIN` - match related resources
- `LEFT JOIN` - find orphaned resources
- Cross-plugin joins (AWS + K8s)
- Join key validation

**Example Queries:**
```sql
-- Find pods using specific secrets
SELECT pods.name, secrets.name
FROM k8s_pods pods
JOIN k8s_secrets secrets ON pods.secret_ref = secrets.name;

-- Find EC2 instances not in ECS
SELECT ec2.instance_id, ec2.tags
FROM ec2_instances ec2
LEFT JOIN ecs_instances ecs ON ec2.instance_id = ecs.instance_id
WHERE ecs.instance_id IS NULL;
```

**Challenges:** 
- Performance (fetch all data then join? or push-down?)
- Cross-source joins (different APIs, rate limits)

---

### 7. Handle Large Result Sets
**Status:** Not Started  
**Effort:** Medium  
**Impact:** High

Querying 1000s of resources will cause OOM. Need:

- Streaming results (don't load everything in memory)
- Cursor-based pagination
- Result set limits (default 1000?)
- Progress indicators for long queries
- Ability to cancel running queries

**Implementation:**
- Generator functions for plugins
- Async iterators
- Backpressure handling

---

### 8. Implement Query Caching
**Status:** Not Started  
**Effort:** Medium  
**Impact:** Medium

Infrastructure queries are slow (API calls). Need smart caching:

- Cache results by query hash
- TTL per data source (EC2: 5min, S3: 1hr)
- Cache invalidation commands
- Memory limits
- Optional persistent cache (Redis?)

**CLI Commands:**
```sql
-- Cache control
SHOW CACHE;
CLEAR CACHE;
SET CACHE TTL 300;
```

---

## 🟢 Medium Priority (Nice to Have)

### 9. Improve Performance & Parallelization
**Status:** Not Started  
**Effort:** High  
**Impact:** Medium

- Parallel plugin queries (fetch AWS + K8s simultaneously)
- Connection pooling
- Batch API requests
- Query optimization (push filters to API when possible)
- Lazy loading (don't fetch all columns if not needed)

---

### 10. Add Query Validation & Safety
**Status:** Not Started  
**Effort:** Medium  
**Impact:** Medium

Prevent dangerous/expensive queries:

- Validate table names exist before execution
- Validate column names
- Require WHERE clause for large tables?
- Query cost estimation
- Dry-run mode
- Read-only enforcement (no accidental DELETE)

---

### 11. Add Comprehensive Test Coverage
**Status:** Not Started  
**Effort:** High  
**Impact:** Medium

Current tests are unit tests only. Need:

- Integration tests with real plugins
- Mock AWS/K8s API responses
- Error scenario tests (network failures, auth errors)
- Performance tests (1000+ resources)
- CLI interaction tests
- End-to-end query tests

**Target Coverage:** 80%+ for core functionality

---

## 🔵 Low Priority (Future Enhancements)

### 12. Implement Plugin Dependency Management
**Status:** Not Started  
**Effort:** Medium  
**Impact:** Low

Plugins need external packages (aws-sdk, k8s client):

- Dynamic plugin loading from npm packages
- Version compatibility checking
- Peer dependency resolution
- Plugin marketplace/registry?

---

### 13. Add Proper Documentation
**Status:** Not Started  
**Effort:** Medium  
**Impact:** Low

Current docs are basic usage. Need:

- Plugin development guide with examples
- Architecture diagrams (lexer → parser → executor flow)
- Deployment guides (Docker, systemd, etc.)
- Troubleshooting guides
- API reference docs
- Video tutorials?

---

### 14. Create Real-World Examples
**Status:** Not Started  
**Effort:** Low  
**Impact:** Low

Show actual DevOps use cases:

- **Cost Analysis:** Find unused resources, over-provisioned instances
- **Security Audits:** Unencrypted volumes, public S3 buckets, exposed ports
- **Compliance:** Check tag compliance, backup status
- **Capacity Planning:** Resource utilization trends
- **Incident Response:** Trace request across services

---

## 📊 Priority Matrix

| Priority | Must Have | Should Have | Nice to Have |
|----------|-----------|-------------|--------------|
| **Critical** | Real plugins, Auth, Config parsing, Error handling | - | - |
| **High** | Aggregations, JOINs, Large results, Caching | - | - |
| **Medium** | - | Performance, Validation, Tests | - |
| **Low** | - | - | Plugin deps, Docs, Examples |

---

## 🎯 Recommended Implementation Order

1. **Week 1-2:** Fix YAML config + Add auth system + Error handling/logging
2. **Week 3-4:** AWS plugin (EC2, RDS basics)
3. **Week 5:** Kubernetes plugin (pods, deployments)
4. **Week 6:** Aggregation functions (COUNT, SUM, GROUP BY)
5. **Week 7:** Handle large result sets + streaming
6. **Week 8:** Query caching
7. **Week 9:** JOIN operations (same source first)
8. **Week 10:** Cross-source JOINs + Performance optimization
9. **Week 11-12:** Comprehensive testing + Documentation

**Estimated time to production-ready:** 3 months with 1 full-time developer

---

## 🚫 What's NOT on the Roadmap

- Write operations (INSERT/UPDATE/DELETE) - read-only by design for safety
- GUI/Web interface - CLI-first approach
- Built-in visualization - pipe to other tools
- Custom query language extensions - stick to SQL standards

---

## 📝 Notes

- This roadmap assumes single developer working part-time
- Priorities may shift based on user feedback
- Plugin ecosystem could grow organically via community
- Consider MVP: AWS EC2 + basic queries (no JOINs/aggregations) for initial release?

**Last Updated:** December 2, 2025
