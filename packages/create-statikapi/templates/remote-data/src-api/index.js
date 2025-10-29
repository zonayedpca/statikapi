export default {
  project: 'APP_NAME',
  template: 'remote-data',
  endpoints: ['/posts', '/posts/:id', '/users'],
  note: 'Data fetched at build time from an external API (swap URLs as needed).',
  generatedAt: new Date().toISOString(),
};
