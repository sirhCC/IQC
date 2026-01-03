# TRACE Implementation for Docker and Kubernetes Plugins

## Overview

Implemented comprehensive TRACE functionality for both Docker and Kubernetes plugins, removing the TODOs and enabling users to follow resources through related infrastructure components.

## Implementation Details

### Docker Plugin TRACE

The Docker plugin now supports tracing by:

#### 1. **Container Tracing** (`container_id` or `name`)
- Finds the container by ID or name
- Traces to the container's base image
- Discovers related volumes (from mounts)
- Identifies connected networks

**Example:**
```sql
TRACE container_id = 'abc123' THROUGH docker
```

Returns hops through:
- `docker_containers` - The container itself
- `docker_images` - The image the container uses
- `docker_volumes` - Any volumes mounted by the container
- `docker_networks` - Networks the container is connected to

#### 2. **Image Tracing** (`image` or `image_id`)
- Finds the image by ID or repository:tag
- Discovers all containers using this image

**Example:**
```sql
TRACE image = 'nginx:latest' THROUGH docker
```

### Kubernetes Plugin TRACE

The Kubernetes plugin now supports tracing by:

#### 1. **Pod Tracing** (`pod` or `pod_name`)
- Finds the pod by name
- Traces to the owning Deployment (via ReplicaSet)
- Discovers Services selecting this pod
- Retrieves pod events for troubleshooting

**Example:**
```sql
TRACE pod = 'my-app-123abc' THROUGH kubernetes
```

Returns hops through:
- `k8s_pods` - The pod itself
- `k8s_deployments` - The deployment that owns the pod
- `k8s_services` - Services routing to this pod
- `k8s_events` - Recent events related to the pod

#### 2. **Deployment Tracing** (`deployment` or `deployment_name`)
- Finds the deployment by name
- Discovers all pods owned by this deployment

**Example:**
```sql
TRACE deployment = 'my-app' THROUGH kubernetes
```

#### 3. **Service Tracing** (`service` or `service_name`)
- Finds the service by name
- Discovers all pods matching the service selector

**Example:**
```sql
TRACE service = 'frontend' THROUGH kubernetes
```

## Technical Implementation

### Error Handling
- Wrapped all API calls with try-catch blocks
- Used `logError` utility for proper error logging
- Returns empty array on failure (graceful degradation)

### Type Safety
- Added proper TypeScript type annotations
- Used Kubernetes client types (`k8s.V1Pod`, `k8s.V1Deployment`, etc.)
- Handled API response structure correctly

### API Usage
- Docker: Used `dockerode` library methods
- Kubernetes: Used `@kubernetes/client-node` client APIs
- Applied `withRetryAndTimeout` wrapper for resilience

## Benefits

1. **Full Resource Tracking**: Follow a container through its entire stack
2. **Troubleshooting**: Quickly see all related resources when debugging
3. **Dependency Discovery**: Understand which resources depend on each other
4. **Multi-Source Tracing**: Can trace across multiple plugins in one query

## Example Use Cases

### Track a failing container
```sql
TRACE container_id = 'webapp123' THROUGH docker
-- Shows image, volumes, networks - helps identify misconfigurations
```

### Find all pods for a service
```sql
TRACE service = 'api-gateway' THROUGH kubernetes
-- Lists all pods behind a service - useful for load balancing analysis
```

### Trace deployment lifecycle
```sql
TRACE deployment = 'backend-api' THROUGH kubernetes
-- Shows deployment → pods → services → events
-- Complete view of deployment status
```

### Cross-infrastructure tracing
```sql
TRACE service_id = 'app-123' THROUGH aws, kubernetes, docker
-- Follows a service across cloud resources, K8s, and containers
```

## Testing

Run the test script to verify functionality:
```bash
npx tsx test-trace.ts
```

## Removed TODOs

✅ `src/plugins/docker-plugin.ts:324` - Implemented container trace  
✅ `src/plugins/kubernetes-plugin.ts:375` - Implemented pod trace

## Remaining Work

- Add more identifier types (e.g., trace by labels, annotations)
- Performance optimization for large clusters
- Caching of trace results
- Visualization of trace graphs
