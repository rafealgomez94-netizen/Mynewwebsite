import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['nodemailer'],
  // The preview environment serves the dev server through a proxied host, so it
  // must be allowed to request dev assets (HMR, RSC payloads, dev overlay).
  allowedDevOrigins: [
    '*.e2b.app',
    '*.arena.ai',
    'localhost',
    '127.0.0.1',
  ],
  experimental: {
    serverActions: {
      allowedOrigins: ['*.e2b.app', '*.arena.ai', 'localhost:3000', '127.0.0.1:3000'],
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
