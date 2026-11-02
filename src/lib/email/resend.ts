import { Resend } from 'resend'
import { env } from '~/env.js'

export function getResendClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error(
      'Email delivery is disabled until RESEND_API_KEY is configured',
    )
  }

  return new Resend(env.RESEND_API_KEY)
}
