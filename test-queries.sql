SELECT * FROM services;
SELECT name, status FROM services WHERE environment = 'production';
SELECT name, cpu_usage FROM services WHERE cpu_usage > 30 ORDER BY cpu_usage DESC;
