#!/usr/bin/env node

/**
 * IQL CLI - Infrastructure Query Language Command Line Interface
 */

import { Command } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Parser } from './parser';
import { QueryExecutor } from './engine';
import { PluginManager, MockPlugin } from './plugins';
import { IQLConfig, QueryResult } from './types';

const program = new Command();

program
  .name('iql')
  .description('Infrastructure Query Language - SQL for DevOps')
  .version('1.0.0');

program
  .option('-f, --file <path>', 'Execute queries from file')
  .option('-o, --output <format>', 'Output format: table, json, csv, yaml', 'table')
  .option('-c, --config <path>', 'Path to config file', './iql.config.yaml')
  .action(async (options) => {
    const pluginManager = new PluginManager();
    const executor = new QueryExecutor(pluginManager);
    
    // Load config if exists
    const config = loadConfig(options.config);
    
    // Register plugins
    await registerPlugins(pluginManager, config);
    
    if (options.file) {
      // Execute from file
      await executeFile(options.file, executor, options.output);
    } else {
      // Start REPL
      await startRepl(executor, pluginManager, options.output);
    }
    
    // Cleanup
    await pluginManager.cleanup();
  });

async function registerPlugins(manager: PluginManager, config?: IQLConfig): Promise<void> {
  // Always register mock plugin for testing
  await manager.registerPlugin(new MockPlugin());
  
  if (config?.plugins) {
    console.log(chalk.yellow('Custom plugin loading not yet implemented'));
    // TODO: Load custom plugins from config
  }
}

function loadConfig(configPath: string): IQLConfig | undefined {
  try {
    if (fs.existsSync(configPath)) {
      // TODO: Parse YAML config
      console.log(chalk.yellow(`Config file found at ${configPath} but YAML parsing not yet implemented`));
    }
  } catch (error) {
    console.error(chalk.red(`Error loading config: ${error}`));
  }
  return undefined;
}

async function executeFile(
  filePath: string,
  executor: QueryExecutor,
  outputFormat: string
): Promise<void> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const queries = content.split(';').filter((q) => q.trim());
    
    for (const queryText of queries) {
      if (!queryText.trim()) continue;
      
      console.log(chalk.cyan(`\nExecuting: ${queryText.trim()}`));
      await executeQuery(queryText, executor, outputFormat);
    }
  } catch (error) {
    console.error(chalk.red(`Error reading file: ${error}`));
    process.exit(1);
  }
}

async function startRepl(
  executor: QueryExecutor,
  pluginManager: PluginManager,
  outputFormat: string
): Promise<void> {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║  Infrastructure Query Language (IQL) - Interactive Shell ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════╝\n'));
  console.log(chalk.gray('Type your queries or commands:'));
  console.log(chalk.gray('  .help    - Show help'));
  console.log(chalk.gray('  .tables  - List all tables'));
  console.log(chalk.gray('  .plugins - List all plugins'));
  console.log(chalk.gray('  .health  - Check plugin health'));
  console.log(chalk.gray('  .exit    - Exit shell\n'));
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('iql> '),
  });
  
  rl.prompt();
  
  rl.on('line', async (line) => {
    const input = line.trim();
    
    if (!input) {
      rl.prompt();
      return;
    }
    
    // Handle special commands
    if (input.startsWith('.')) {
      await handleCommand(input, pluginManager);
      rl.prompt();
      return;
    }
    
    // Execute query
    try {
      await executeQuery(input, executor, outputFormat);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
    
    rl.prompt();
  });
  
  rl.on('close', () => {
    console.log(chalk.cyan('\nGoodbye!'));
    process.exit(0);
  });
}

async function handleCommand(command: string, pluginManager: PluginManager): Promise<void> {
  switch (command) {
    case '.help':
      console.log(chalk.bold('\nAvailable Commands:'));
      console.log('  .help    - Show this help message');
      console.log('  .tables  - List all available tables');
      console.log('  .plugins - List all registered plugins');
      console.log('  .health  - Check health of all plugins');
      console.log('  .exit    - Exit the shell');
      console.log(chalk.bold('\nQuery Examples:'));
      console.log('  SELECT * FROM services WHERE environment = \'production\'');
      console.log('  SELECT name, status FROM services WHERE cpu_usage > 50');
      console.log('  TRACE service_id = \'svc-1\' THROUGH mock');
      console.log('  DESCRIBE services');
      console.log('  SHOW TABLES');
      break;
      
    case '.tables':
      const tables = await pluginManager.getAllTables();
      console.log(chalk.bold('\nAvailable Tables:'));
      tables.forEach((table) => {
        console.log(`  ${chalk.cyan(table.name)} (${table.source}) - ${table.columns.length} columns`);
      });
      break;
      
    case '.plugins':
      const plugins = pluginManager.listPlugins();
      console.log(chalk.bold('\nRegistered Plugins:'));
      plugins.forEach((plugin) => {
        console.log(`  ${chalk.cyan(plugin.name)} v${plugin.version}`);
        if (plugin.description) {
          console.log(`    ${chalk.gray(plugin.description)}`);
        }
      });
      break;
      
    case '.health':
      const health = await pluginManager.healthCheck();
      console.log(chalk.bold('\nPlugin Health Status:'));
      Object.entries(health).forEach(([name, status]) => {
        const icon = status.healthy ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${icon} ${name}: ${status.message || 'OK'}`);
      });
      break;
      
    case '.exit':
      process.exit(0);
      break;
      
    default:
      console.log(chalk.red(`Unknown command: ${command}`));
      console.log(chalk.gray('Type .help for available commands'));
  }
}

async function executeQuery(
  queryText: string,
  executor: QueryExecutor,
  outputFormat: string
): Promise<void> {
  try {
    const parser = new Parser(queryText);
    const query = parser.parse();
    const result = await executor.execute(query);
    
    formatOutput(result, outputFormat);
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
  }
}

function formatOutput(result: any, format: string): void {
  switch (format) {
    case 'json':
      console.log(JSON.stringify(result, null, 2));
      break;
      
    case 'csv':
      if (result.rows && result.columns) {
        // Header
        console.log(result.columns.map((c: any) => c.name).join(','));
        // Rows
        result.rows.forEach((row: any) => {
          console.log(
            result.columns.map((c: any) => JSON.stringify(row[c.name] ?? '')).join(',')
          );
        });
      } else {
        console.log(JSON.stringify(result));
      }
      break;
      
    case 'table':
    default:
      if (result.rows && result.columns) {
        printTable(result);
      } else if (result.items) {
        // SHOW results
        console.log(chalk.bold(`\n${result.what}:`));
        result.items.forEach((item: any) => {
          console.log(`  ${JSON.stringify(item, null, 2)}`);
        });
      } else if (result.hops) {
        // TRACE results
        console.log(chalk.bold(`\nTrace: ${result.identifier} = ${result.value}`));
        console.log(chalk.gray(`Total hops: ${result.totalHops}\n`));
        result.hops.forEach((hop: any, idx: number) => {
          console.log(chalk.cyan(`${idx + 1}. ${hop.source}/${hop.table} @ ${hop.timestamp}`));
          console.log(`   ${JSON.stringify(hop.data, null, 2)}`);
        });
      } else if (result.table && result.columns) {
        // DESCRIBE results
        console.log(chalk.bold(`\nTable: ${result.table} (${result.source})`));
        console.log(chalk.bold('Columns:'));
        result.columns.forEach((col: any) => {
          console.log(`  ${chalk.cyan(col.name)}: ${col.type}`);
        });
      } else {
        console.log(result);
      }
      break;
  }
}

function printTable(result: QueryResult): void {
  if (result.rows.length === 0) {
    console.log(chalk.yellow('\nNo results found.'));
    return;
  }
  
  const columnNames = result.columns.map((c) => c.name);
  const columnWidths = columnNames.map((name, idx) => {
    const maxDataWidth = Math.max(
      ...result.rows.map((row) => String(row[name] ?? '').length)
    );
    return Math.max(name.length, maxDataWidth, 3);
  });
  
  // Header
  console.log();
  console.log(
    columnNames
      .map((name, idx) => chalk.bold(name.padEnd(columnWidths[idx])))
      .join(' │ ')
  );
  console.log(columnWidths.map((w) => '─'.repeat(w)).join('─┼─'));
  
  // Rows
  result.rows.forEach((row) => {
    console.log(
      columnNames
        .map((name, idx) => String(row[name] ?? '').padEnd(columnWidths[idx]))
        .join(' │ ')
    );
  });
  
  console.log(chalk.gray(`\n${result.rowCount} row(s) returned`));
  if (result.totalCount !== result.rowCount) {
    console.log(chalk.gray(`${result.totalCount} total row(s) in table`));
  }
}

program.parse();
