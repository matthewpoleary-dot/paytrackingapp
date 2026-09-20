import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tally — shifts and pay',
    short_name: 'Tally',
    description: 'Log your shifts. Know what the week is worth.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Matches the bone page field, so the launch frame is the app's own
    // surface rather than a white flash before the first paint.
    background_color: '#ebe9dc',
    theme_color: '#0b3028',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
