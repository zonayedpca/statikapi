export function readFlags(argv = []) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('-')) continue;

    if (t.startsWith('--')) {
      const [k, v] = t.slice(2).split('=', 2);
      // allow any flag, we’ll read only the ones we need in commands
      if (v !== undefined) out[k] = coerce(v);
      else {
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          out[k] = coerce(next);
          i++;
        } else out[k] = true; // <- bare flag now boolean true
      }
    }
  }
  return out;
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}
