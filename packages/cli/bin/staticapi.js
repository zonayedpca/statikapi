#!/usr/bin/env node
import { hello } from '@staticapi/core';

const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-v')) {
  // match package version without importing JSON (keeps ESM simple)
  console.log('staticapi v0.1.0');
  process.exit(0);
}

if (args[0] === 'build') {
  console.log('Building static API…');
  // stub: call core
  console.log(hello('staticapi'));
  process.exit(0);
}

console.log(`
Usage:
  staticapi build        Build static JSON APIs
  staticapi -v|--version Show version
`);
process.exit(0);
