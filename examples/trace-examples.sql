-- IQL Trace Examples
-- Demonstrates the new TRACE functionality for Docker and Kubernetes plugins

-- ============================================================================
-- DOCKER TRACES
-- ============================================================================

-- Trace a container to see its image, volumes, and networks
TRACE container_id = 'webapp_container' THROUGH docker;

-- Trace by container name
TRACE name = 'nginx-proxy' THROUGH docker;

-- Trace an image to find all containers using it
TRACE image = 'node:18-alpine' THROUGH docker;

-- Trace by image ID
TRACE image_id = 'abc123def456' THROUGH docker;

-- ============================================================================
-- KUBERNETES TRACES
-- ============================================================================

-- Trace a pod to see its deployment, services, and events
TRACE pod = 'frontend-app-7d9f8b6c5-k2mx7' THROUGH kubernetes;

-- Trace a deployment to see all its pods
TRACE deployment = 'backend-api' THROUGH kubernetes;

-- Trace a service to see all pods it routes to
TRACE service = 'api-gateway' THROUGH kubernetes;

-- ============================================================================
-- MULTI-SOURCE TRACES
-- ============================================================================

-- Trace across multiple data sources
TRACE service_id = 'app-123' THROUGH aws, kubernetes, docker;

-- Trace with mock data for testing
TRACE service_id = 'svc-1' THROUGH mock;

-- ============================================================================
-- PRACTICAL USE CASES
-- ============================================================================

-- Find why a container keeps restarting
-- 1. Trace the container to see its image and volumes
TRACE container_id = 'failing_app' THROUGH docker;
-- 2. Check the image for issues
SELECT * FROM docker_images WHERE image_id = '<id_from_trace>';

-- Debug Kubernetes pod not starting
-- 1. Trace the pod to see events
TRACE pod = 'myapp-pod-xyz' THROUGH kubernetes;
-- 2. Check the deployment
SELECT * FROM k8s_deployments WHERE name = '<deployment_from_trace>';

-- Find all infrastructure for a service
-- 1. Trace through all sources
TRACE service_id = 'payment-service' THROUGH aws, kubernetes, docker;
-- 2. Analyze the complete stack

-- Track down image vulnerabilities
-- 1. Find all containers using an image
TRACE image = 'vulnerable-image:1.0' THROUGH docker;
-- 2. Update or stop those containers

-- Investigate service connectivity
-- 1. Trace the service
TRACE service = 'frontend' THROUGH kubernetes;
-- 2. Verify pod IPs and status
SELECT name, ip, status FROM k8s_pods WHERE name IN ('<pod_names_from_trace>');
