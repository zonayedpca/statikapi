import { cloneListIndexConfig } from './listIndex.js';

export const DEFAULT_CONFIG = {
  srcDir: 'src-api',
  outDir: 'api-out',
  listIndex: cloneListIndexConfig(),
};
