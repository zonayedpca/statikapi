#!/usr/bin/env node
import { run } from '../src/index.js';

const exit = await run();
process.exit(exit);
