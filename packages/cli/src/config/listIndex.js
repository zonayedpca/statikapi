export const DEFAULT_LIST_INDEX_CONFIG = Object.freeze({
  enabled: false,
  pick: null,
});

export function cloneListIndexConfig(cfg = DEFAULT_LIST_INDEX_CONFIG) {
  return {
    enabled: cfg.enabled,
    pick: cfg.pick ? [...cfg.pick] : null,
  };
}

export function normalizeListIndexValue(raw, { label = 'listIndex' } = {}) {
  const base = cloneListIndexConfig();

  if (raw == null || raw === false) return base;
  if (raw === true) {
    base.enabled = true;
    return base;
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label} must be true, false, or an object`);
  }

  const enabled = raw.enabled == null ? true : raw.enabled;
  if (typeof enabled !== 'boolean') {
    throw new Error(`${label}.enabled must be a boolean`);
  }

  let pick = null;
  if ('pick' in raw) {
    if (raw.pick != null) {
      pick = normalizePick(raw.pick, { label: `${label}.pick` });
    }
  }

  return { enabled, pick };
}

export function applyListIndexFlagOverrides(baseCfg, flags = {}) {
  const next = cloneListIndexConfig(baseCfg);
  const hasEnabled = flags.listIndex != null;
  const hasPick = flags.listIndexPick != null;

  if (!hasEnabled && !hasPick) return next;

  if (hasEnabled) {
    const raw = flags.listIndex;
    if (typeof raw !== 'boolean') {
      throw new Error(`listIndex flag must be true or false`);
    }
    next.enabled = raw;
    if (raw === false && !hasPick) next.pick = null;
  }

  if (hasPick) {
    next.pick = normalizePick(flags.listIndexPick, { label: 'listIndexPick flag' });
    if (!hasEnabled) next.enabled = true;
  }

  return next;
}

function normalizePick(raw, { label }) {
  if (Array.isArray(raw)) {
    return dedupePick(raw, { label });
  }
  if (typeof raw === 'string') {
    return dedupePick(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      { label }
    );
  }
  throw new Error(`${label} must be an array of strings`);
}

function dedupePick(list, { label }) {
  for (const key of list) {
    if (typeof key !== 'string' || !key) {
      throw new Error(`${label} must contain non-empty strings`);
    }
  }
  return Array.from(new Set(list));
}
