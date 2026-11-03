import type { MetadataRoute } from 'next'

/**
 * Makes "Add to Home Screen" on Android use the AK monogram instead of a
 * screenshot, and gives the installed app a proper name and theme colour.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Abhinav Karhale Photography',
    short_name: 'AK Photography',
    description: 'Selected photographic work by Abhinav Karhale.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#09090b',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
