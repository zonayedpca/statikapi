#!/usr/bin/env node
import { run } from '../src/index.js';

// pass argv explicitly
const code = await run(process.argv.slice(2));

// let stdout/stderr flush; still returns non-zero on failure
process.exitCode = Number.isInteger(code) ? code : 0;
