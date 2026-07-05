import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow Next.js Image component to load avatars from GitHub's CDN
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
    ],
  },

  // Strict mode catches potential bugs during development
  reactStrictMode: true,

  // Expose backend API URL to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:5000',
  },
};

export default nextConfig;
