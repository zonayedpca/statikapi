import path from 'node:path';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function validateAndNormalize(userCfg, { cwd = process.cwd() } = {}) {
  const cfg = { ...userCfg };

  for (const key of ['srcDir', 'outDir']) {
    if (typeof cfg[key] !== 'string' || !cfg[key].trim()) {
      throw new ConfigError(`"${key}" must be a non-empty string`);
    }
    if (path.isAbsolute(cfg[key])) {
      throw new ConfigError(`"${key}" must be a relative path. Got absolute: ${cfg[key]}`);
    }
    // normalize separators & remove ./ and a/../b
    const normalized = path.posix.normalize(cfg[key].replaceAll(path.sep, '/'));
    if (normalized.startsWith('..')) {
      throw new ConfigError(`"${key}" cannot traverse outside the project: ${normalized}`);
    }
    cfg[key] = normalized;
  }

  if (cfg.srcDir === cfg.outDir) {
    throw new ConfigError(`"srcDir" and "outDir" must differ (both "${cfg.srcDir}")`);
  }

  return {
    ...cfg,
    paths: {
      srcAbs: path.join(cwd, cfg.srcDir),
      outAbs: path.join(cwd, cfg.outDir),
    },
  };
}
