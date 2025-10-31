export default {
  project: 'StatikAPI',
  cli: 'src-api',
  endpoints: ['/users/:id', '/docs/*slug'],
  note: 'Dynamic slugs are prebuilt from paths()',
  timestamp: new Date().toISOString(),
};
