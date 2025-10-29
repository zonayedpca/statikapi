export function formatBytes(n) {
  if (n < 1024) return `${n} B`;

  const units = ['KB', 'MB', 'GB'];
  let u = -1;

  do {
    n /= 1024;
    u++;
  } while (n >= 1024 && u < units.length - 1);

  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[u]}`;
}
