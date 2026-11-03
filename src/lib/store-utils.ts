import { siteConfig } from '~/config/site'

/**
 * Checks if the store is enabled on the client side
 * Only checks siteConfig to avoid leaking environment variables
 */
export function isStoreEnabledClient(): boolean {
  return siteConfig.features.storeEnabled
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
