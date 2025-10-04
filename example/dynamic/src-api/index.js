export default {
  project: 'StaticAPI',
  example: 'dynamic',
  endpoints: ['/users/:id', '/docs/*slug'],
  note: 'Dynamic slugs are prebuilt from paths()',
  timestamp: new Date().toISOString(),
};
