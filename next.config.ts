import { withAxiom } from 'next-axiom'
import type { NextConfig } from 'next'

// Import site config to get the configured image domain
const getImageDomain = () => {
  // Use environment variable directly or fallback to wildcard
  const domain = process.env.NEXT_PUBLIC_IMAGE_DOMAIN
  return domain ? `**.${domain}` : '**'
}

// Hosts the browser is allowed to fetch media/connections from. Built from the
// same env vars the app uses, so the policy follows the deployment.
const mediaHosts = [
  'https://*.r2.cloudflarestorage.com',
  process.env.NEXT_PUBLIC_STREAM_BUCKET_URL,
  ...(process.env.NEXT_PUBLIC_MEDIA_HOSTS?.split(',') ?? []),
]
  .map((host) => host?.trim())
  .filter(Boolean)

const connectHosts = [
  'https://api.razorpay.com',
  'https://lumberjack.razorpay.com',
  'https://*.r2.cloudflarestorage.com',
  process.env.NEXT_PUBLIC_IMAGE_BUCKET_URL,
  process.env.NEXT_PUBLIC_BLOG_BUCKET_URL,
  process.env.NEXT_PUBLIC_ABOUT_BUCKET_URL,
  process.env.NEXT_PUBLIC_CUSTOM_BUCKET_URL,
  process.env.NEXT_PUBLIC_STREAM_BUCKET_URL,
  process.env.NEXT_PUBLIC_FILES_BUCKET_URL,
]
  .map((host) => host?.trim())
  .filter(Boolean)

const contentSecurityPolicy = [
  "default-src 'self'",
  // Razorpay Checkout injects its script from this host.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `media-src 'self' data: blob: ${mediaHosts.join(' ')}`,
  `connect-src 'self' ${connectHosts.join(' ')}`,
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]
  .join('; ')
  .concat(';')

// Enforced headers plus a *report-only* CSP. Report-only means a policy mistake
// is logged in the browser console instead of breaking checkout or video, so we
// can tighten it later without risking a live outage.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The legacy XSS auditor is removed from modern browsers and was itself
  // exploitable; 0 disables it everywhere.
  { key: 'X-XSS-Protection', value: '0' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy },
]

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: getImageDomain(),
        port: '',
      },
    ],
    minimumCacheTTL: 2678400, // Set to 31 days to reduce cache writes
    deviceSizes: [640, 750, 828, 1080, 1200, 1920], // Reduced number of device sizes
    imageSizes: [16, 32, 64, 96, 128, 256], // Reduced number of image sizes
    formats: ['image/webp'], // Prefer WebP format for better compression
  },
  serverExternalPackages: [
    '@aws/sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    'prettier',
  ],
  experimental: {
    browserDebugInfoInTerminal: true,
  },
  reactCompiler: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default withAxiom(nextConfig)
