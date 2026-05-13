import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Roseland Schedule',
    short_name: 'Schedule',
    description: 'Production schedule manager for film and TV',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#0a0a0f',
    theme_color: '#e8197d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '1254x1254', type: 'image/png' },
    ],
  };
}
