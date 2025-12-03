# AWS Plugin Usage Guide

## Prerequisites

Set up AWS credentials using one of these methods:

### Option 1: Environment Variables
```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

### Option 2: AWS Profile
```bash
export AWS_PROFILE="your-profile-name"
export AWS_REGION="us-east-1"
```

### Option 3: Default Credentials
Use `~/.aws/credentials` and `~/.aws/config` files (AWS CLI default)

## Available Tables

### ec2_instances
Query all EC2 instances in your account:
```sql
-- List all EC2 instances
SELECT * FROM ec2_instances;

-- Running instances only
SELECT instance_id, instance_type, state, availability_zone 
FROM ec2_instances 
WHERE state = 'running';

-- Large instances
SELECT instance_id, instance_type, private_ip, public_ip
FROM ec2_instances
WHERE instance_type LIKE 't3.%'
ORDER BY instance_type;

-- Instances by tag
SELECT instance_id, tags
FROM ec2_instances
WHERE tags LIKE 'production';
```

### rds_instances
Query RDS database instances:
```sql
-- List all RDS instances
SELECT * FROM rds_instances;

-- MySQL databases
SELECT db_instance_identifier, engine, engine_version, status
FROM rds_instances
WHERE engine = 'mysql';

-- Large databases (> 100 GB)
SELECT db_instance_identifier, allocated_storage, endpoint
FROM rds_instances
WHERE allocated_storage > 100
ORDER BY allocated_storage DESC;

-- Available databases
SELECT db_instance_identifier, db_instance_class, availability_zone
FROM rds_instances
WHERE status = 'available';
```

### lambda_functions
Query Lambda functions:
```sql
-- List all Lambda functions
SELECT * FROM lambda_functions;

-- Python functions
SELECT function_name, runtime, memory_size, timeout
FROM lambda_functions
WHERE runtime LIKE 'python%';

-- Large functions (> 10 MB)
SELECT function_name, code_size, memory_size
FROM lambda_functions
WHERE code_size > 10485760
ORDER BY code_size DESC;

-- High memory functions
SELECT function_name, memory_size, timeout
FROM lambda_functions
WHERE memory_size > 512
ORDER BY memory_size DESC;
```

## Example Queries

### Find all stopped EC2 instances
```sql
SELECT instance_id, instance_type, availability_zone, launch_time
FROM ec2_instances
WHERE state = 'stopped';
```

### List expensive RDS instances
```sql
SELECT db_instance_identifier, db_instance_class, allocated_storage, engine
FROM rds_instances
WHERE db_instance_class LIKE 'db.r%'  -- Memory-optimized
ORDER BY allocated_storage DESC;
```

### Lambda functions by runtime
```sql
SELECT runtime, function_name, last_modified
FROM lambda_functions
WHERE runtime = 'nodejs18.x'
ORDER BY last_modified DESC
LIMIT 10;
```

## Testing Without AWS

If you don't have AWS credentials, use the mock plugin:
```sql
-- Mock data is always available
SELECT * FROM services;
SELECT * FROM deployments;
SELECT * FROM incidents;
```

## Troubleshooting

### Plugin not loading
```
ℹ AWS plugin not loaded (no credentials found)
```
**Solution:** Set AWS credentials via environment variables or profile

### Permission errors
```
⚠ AWS plugin failed to initialize: Access Denied
```
**Solution:** Ensure your IAM user/role has these permissions:
- `ec2:DescribeInstances`
- `rds:DescribeDBInstances`
- `lambda:ListFunctions`

### Region issues
```
⚠ AWS plugin failed to initialize: Could not resolve region
```
**Solution:** Set `AWS_REGION` or `AWS_DEFAULT_REGION` environment variable

## Performance Notes

- First query fetches all resources from AWS (can be slow)
- Filtering happens client-side after fetch
- Future: Add caching to avoid repeated API calls
- Future: Push filters to AWS API for better performance

## What's Next

Coming soon:
- S3 buckets
- ECS/EKS clusters  
- IAM users/roles
- VPCs and security groups
- CloudWatch metrics
- Cost Explorer data
