#!/usr/bin/env node

/**
 * Test runner script - validates IQL functionality
 */

const { execSync } = require('child_process');
const chalk = require('chalk');

console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════════════════╗'));
console.log(chalk.bold.cyan('║  IQL Test Suite - Comprehensive Validation       ║'));
console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════════╝\n'));

const tests = [
  {
    name: 'TypeScript Compilation',
    command: 'npm run type-check',
    critical: true,
  },
  {
    name: 'Unit & Integration Tests',
    command: 'npm test',
    critical: true,
  },
  {
    name: 'Build Check',
    command: 'npm run build',
    critical: true,
  },
  {
    name: 'Linting',
    command: 'npm run lint',
    critical: false,
  },
];

let passed = 0;
let failed = 0;
let warnings = 0;

tests.forEach((test, index) => {
  console.log(chalk.bold(`\n[${index + 1}/${tests.length}] ${test.name}`));
  console.log(chalk.gray('─'.repeat(50)));
  
  try {
    execSync(test.command, { stdio: 'inherit' });
    console.log(chalk.green(`✓ ${test.name} passed\n`));
    passed++;
  } catch (error) {
    if (test.critical) {
      console.log(chalk.red(`✗ ${test.name} failed\n`));
      failed++;
    } else {
      console.log(chalk.yellow(`⚠ ${test.name} has warnings\n`));
      warnings++;
    }
  }
});

console.log(chalk.bold('\n╔═══════════════════════════════════════════════════╗'));
console.log(chalk.bold('║  Test Summary                                     ║'));
console.log(chalk.bold('╚═══════════════════��═══════════════════════════════╝\n'));

console.log(`${chalk.green('✓ Passed:')} ${passed}`);
if (failed > 0) {
  console.log(`${chalk.red('✗ Failed:')} ${failed}`);
}
if (warnings > 0) {
  console.log(`${chalk.yellow('⚠ Warnings:')} ${warnings}`);
}

console.log(chalk.gray(`\nTotal: ${tests.length} test suites`));

if (failed > 0) {
  console.log(chalk.red('\n✗ Some critical tests failed!'));
  process.exit(1);
} else if (warnings > 0) {
  console.log(chalk.yellow('\n✓ All critical tests passed (with warnings)'));
  process.exit(0);
} else {
  console.log(chalk.green('\n✓ All tests passed!'));
  process.exit(0);
}
