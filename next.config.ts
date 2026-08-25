import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 writes AGENTS.md/CLAUDE.md into the repo root on dev start; this
  // project keeps its guidance in README.md and docs/ARCHITECTURE.md instead.
  agentRules: false,
  /**
   * These packages contain native bindings (libvips / onnxruntime) and must not be
   * bundled by webpack/turbopack — they are required at runtime from node_modules.
   *
   * NOTE: `sharp` is deduped to a single version via the `overrides` field in
   * package.json. Two copies of sharp in one process load two libvips binaries and
   * segfault the Node process. Do not remove that override.
   */
  serverExternalPackages: [
    'sharp',
    'onnxruntime-node',
    '@imgly/background-removal-node',
    'heic-decode',
  ],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
