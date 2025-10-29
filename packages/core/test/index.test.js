import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hello } from '../src/index.js';

test('hello() returns expected greeting', () => {
  assert.equal(hello('statikapi'), 'hello, statikapi');
  assert.equal(hello(), 'hello, world');
});
