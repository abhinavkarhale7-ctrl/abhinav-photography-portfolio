import { siteConfig } from '~/config/site'

/**
 * Checks if the store is enabled on the client side.
 *
 * NEXT_PUBLIC_* values must be read with a literal member expression so the
 * bundler can inline them. `getEnv('NEXT_PUBLIC_STORE_ENABLED', ...)` uses a
 * dynamic key, which cannot be inlined, so in the browser it always fell back
 * to the default (false) and the nav dropped the Store link after hydration.
 */
export function isStoreEnabledClient(): boolean {
  const raw = process.env.NEXT_PUBLIC_STORE_ENABLED

  if (raw === undefined || raw === '') {
    return siteConfig.features.storeEnabled
  }

  const value = raw.toLowerCase()
  return value === 'true' || value === '1' || value === 'yes'
}

/**
 * Checks if the store is enabled on the server side.
 *
 * The storefront and checkout need a working payment provider. This project
 * uses Razorpay, so the gate checks Razorpay credentials rather than Stripe.
 */
export function isStoreEnabledServer(): boolean {
  // First check if store is disabled in config
  if (!siteConfig.features.storeEnabled) {
    return false
  }

  const hasKeyId = !!(
    process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
  )
  const hasKeySecret = !!process.env.RAZORPAY_KEY_SECRET

  return hasKeyId && hasKeySecret
}
