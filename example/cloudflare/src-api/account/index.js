export const config = {
  cloudflare: {
    public: false,
  },
};

export default function data() {
  return {
    surface: 'private',
    timestamp: new Date().toISOString(),
  };
}
