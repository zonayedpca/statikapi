import devCmd from './dev.js';

export default async function previewCmd(argv) {
  console.warn('`statikapi preview` is deprecated. Use `statikapi dev`.');
  // forward to dev in UI mode
  return devCmd(argv.filter((a) => a !== '--open')); // or just dev(argv)
}
