-- AWS EC2 Queries
SELECT * FROM ec2_instances LIMIT 5;
SELECT instance_id, instance_type, state FROM ec2_instances WHERE state = 'running';

-- AWS RDS Queries  
SELECT * FROM rds_instances LIMIT 5;
SELECT db_instance_identifier, engine, status FROM rds_instances WHERE status = 'available';

-- AWS Lambda Queries
SELECT * FROM lambda_functions LIMIT 5;
SELECT function_name, runtime, memory_size FROM lambda_functions WHERE runtime LIKE 'python%';
