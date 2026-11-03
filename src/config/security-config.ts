// Security configuration for the application
export const securityConfig = {
  // Password requirements
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    bcryptRounds: 12,
  },

  // JWT configuration
  jwt: {
    minSecretLength: 32,
    defaultExpirationHours: 168, // 1 week (reduced from 30 days)
    algorithm: 'HS256' as const,
  },

  // Session configuration
  session: {
    cookieName: 'session',
    httpOnly: true,
    secure: true, // Always secure in production
    sameSite: 'strict' as const,
    path: '/',
  },

  // Rate limiting configuration
  rateLimiting: {
    failClosedEndpoints: ['passwordAttempt', 'email', 'upload'],
    failOpenEndpoints: ['webhook', 'revalidate'],
    adminMultiplier: 3,
  },

  // Security headers live in next.config.ts so they apply to every route.
  // They used to be defined here but were never actually sent.

  // Input validation
  validation: {
    emailMaxLength: 255,
    nameMaxLength: 100,
    passwordMaxLength: 128,
    userAgentMaxLength: 100,
  },

  // Security logging
  logging: {
    maskEmails: true,
    maskIPs: true,
    truncateUserAgent: true,
    maxDetailLength: 200,
  },

  // Account security
  account: {
    maxFailedAttempts: 5,
    lockoutDurationMinutes: 15,
    requireEmailVerification: true, // Enable email verification
    passwordChangeInvalidatesSessions: true,
  },
} as const

export type SecurityConfig = typeof securityConfig
