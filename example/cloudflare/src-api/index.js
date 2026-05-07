export const config = {
  cloudflare: {
    public: true,
  },
};

export default function data() {
  return {
    hello: 'world from worker!',
    surface: 'public!',
    timestamp: new Date().toISOString(),
  };
}
