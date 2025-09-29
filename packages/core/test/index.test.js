import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hello } from '../src/index.js';

test('hello() returns expected greeting', () => {
  assert.equal(hello('staticapi'), 'hello, staticapi');
  assert.equal(hello(), 'hello, world');
});
