import { SerializationError } from './errors.js';

const PLAIN_TAG = '[object Object]';

export function assertSerializable(value, atPath = '$', seen = new WeakSet()) {
  const t = typeof value;

  if (value === null || t === 'string' || t === 'boolean') return;

  if (t === 'number') {
    if (!Number.isFinite(value)) throw new SerializationError('Number must be finite', atPath);

    return;
  }
  if (t === 'bigint') throw new SerializationError('BigInt is not JSON-serializable', atPath);
  if (t === 'symbol') throw new SerializationError('Symbol is not JSON-serializable', atPath);
  if (t === 'function') throw new SerializationError('Function is not JSON-serializable', atPath);

  // Objects / Arrays
  if (typeof value === 'object') {
    if (seen.has(value)) throw new SerializationError('Circular structure detected', atPath);

    seen.add(value);

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        assertSerializable(value[i], `${atPath}[${i}]`, seen);
      }

      return;
    }

    // Plain objects only
    const tag = Object.prototype.toString.call(value);
    const proto = Object.getPrototypeOf(value);
    const isPlain = tag === PLAIN_TAG && (proto === Object.prototype || proto === null);

    if (!isPlain) {
      const name = (value && value.constructor && value.constructor.name) || tag;
      throw new SerializationError(`Only plain objects/arrays allowed (got ${name})`, atPath);
    }

    // No symbol keys
    if (Object.getOwnPropertySymbols(value).length) {
      throw new SerializationError('Symbol keys are not JSON-serializable', atPath);
    }

    for (const k of Object.keys(value)) {
      assertSerializable(value[k], `${atPath}.${k}`, seen);
    }

    return;
  }

  // Anything else falls through as unsupported
  throw new SerializationError(`Unsupported type: ${t}`, atPath);
}
