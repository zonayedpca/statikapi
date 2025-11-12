#!/usr/bin/env node
import { bundle } from '../src/node/bundle.js';

const args = process.argv.slice(2);
let srcDir = 'src-api';
let outFile = 'dist/worker.mjs';
let prettyDefault = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--src' && args[i + 1]) {
    srcDir = args[++i];
  } else if (a === '--out' && args[i + 1]) {
    outFile = args[++i];
  } else if (a === '--pretty') {
    prettyDefault = true;
  } else if (a === '--help' || a === '-h') {
    console.log(`Usage: statikapi-cf bundle [--src src-api] [--out dist/worker.mjs] [--pretty]`);
    process.exit(0);
  }
}

bundle({ srcDir, outFile, prettyDefault })
  .then(() => {
    console.log(`✔ worker emitted → ${outFile}`);
  })
  .catch((e) => {
    console.error(e?.stack || e?.message || String(e));
    process.exit(1);
  });
