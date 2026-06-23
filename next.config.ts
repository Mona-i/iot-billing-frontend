import type { NextConfig } from 'next';
import path from 'path';

const isMockWallet = process.env.NEXT_PUBLIC_MOCK_WALLET === 'true';

const nextConfig: NextConfig = {
  webpack(config) {
    if (isMockWallet) {
      // Replace the real @stellar/freighter-api with our mock at build time
      // so the production bundle stays clean unless the flag is set.
      config.resolve.alias = {
        ...(config.resolve.alias as Record<string, string> | undefined),
        '@stellar/freighter-api': path.resolve(
          __dirname,
          'src/__mocks__/@stellar/freighter-api.ts',
        ),
      };
    }
    return config;
  },

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
