export function readFlags(argv = []) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('-')) continue;

    if (t.startsWith('--')) {
      const [k, v] = t.slice(2).split('=', 2);
      if (k === 'srcDir' || k === 'outDir') {
        if (v !== undefined) out[k] = v;
        else if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
          out[k] = argv[++i];
        } else out[k] = ''; // will fail validation as empty string
      }
    }
  }
  return out;
}
