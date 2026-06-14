import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'IoT Billing Service - DePIN Dashboard',
    short_name: 'IoT Billing',
    description:
      'Enterprise-grade Web3 DePIN dashboard for IoT-Billing-Service. Real-time device telemetry, Soroban smart contract escrow management, and multi-tenant fleet monitoring.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'any',
    categories: ['business', 'utilities', 'iot'],
    lang: 'en',
    scope: '/',
    icons: [
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-192x192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        url: '/dashboard',
        icons: [{ src: '/icon-192x192.png', sizes: '192x192' }],
      },
      { name: 'Escrow', url: '/escrow', icons: [{ src: '/icon-192x192.png', sizes: '192x192' }] },
    ],
  };
}
