import crypto from 'node:crypto'

import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { logAction } from '~/lib/logging'
import { db } from '~/server/db'
import { orderStatusHistory, orders } from '~/server/db/schema'

export const runtime = 'nodejs'

interface RazorpayWebhookBody {
  event?: string
  payload?: {
    payment?: {
      entity?: {
        id?: string
        order_id?: string
        email?: string
        contact?: string
        status?: string
        amount?: number
      }
    }
  }
}

/**
 * Razorpay server-to-server confirmation.
 *
 * Checkout already verifies the payment signature in the browser callback, but
 * that callback never runs if the customer closes the tab or loses connection
 * after paying. This webhook is the authoritative record of "money was taken",
 * so an order can't be left pending after a successful payment.
 */
export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET

  if (!secret) {
    // Razorpay will retry, which is what we want until the secret is set.
    return NextResponse.json(
      { error: 'Webhook is not configured' },
      { status: 503 },
    )
  }

  const signature = request.headers.get('x-razorpay-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // The signature is computed over the raw request body, so read it as text
  // before any JSON parsing.
  const rawBody = await request.text()

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  const provided = Buffer.from(signature)
  const wanted = Buffer.from(expected)

  const validSignature =
    provided.length === wanted.length && crypto.timingSafeEqual(provided, wanted)

  if (!validSignature) {
    await logAction('store', 'Razorpay webhook rejected: invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let body: RazorpayWebhookBody

  try {
    body = JSON.parse(rawBody) as RazorpayWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const payment = body.payload?.payment?.entity
  const razorpayOrderId = payment?.order_id
  const paymentId = payment?.id

  // Acknowledge every other event so Razorpay does not keep retrying it.
  if (body.event !== 'payment.captured' || !razorpayOrderId || !paymentId) {
    return NextResponse.json({ received: true })
  }

  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      email: orders.email,
    })
    .from(orders)
    .where(eq(orders.stripeSessionId, razorpayOrderId))
    .limit(1)

  if (!order) {
    await logAction(
      'store',
      `Razorpay webhook: no order found for ${razorpayOrderId}`,
    )
    return NextResponse.json({ received: true })
  }

  if (order.status !== 'pending') {
    // Already confirmed (browser callback won the race, or a retry).
    return NextResponse.json({ received: true })
  }

  const email = payment?.email?.trim() || order.email

  await db
    .update(orders)
    .set({
      status: 'processing',
      email,
      statusUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id))

  await db.insert(orderStatusHistory).values({
    orderId: order.id,
    status: 'processing',
    note: `Razorpay webhook payment ${paymentId}`,
  })

  await logAction(
    'store',
    `Razorpay webhook confirmed payment ${paymentId} for order ${order.id}`,
  )

  return NextResponse.json({ received: true })
}
