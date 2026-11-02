import crypto from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { logAction } from '~/lib/logging'
import { db } from '~/server/db'
import { orderStatusHistory, orders } from '~/server/db/schema'

interface VerifyPaymentBody {
  orderId?: string
  razorpay_order_id?: string
  razorpay_payment_id?: string
  razorpay_signature?: string
  customer?: {
    name?: string
    email?: string
    phone?: string
    address?: {
      line1?: string
      city?: string
      state?: string
      postal_code?: string
      country?: string
    }
  }
}

export async function POST(request: Request) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keySecret) {
    return NextResponse.json(
      { error: 'Payment gateway is not configured' },
      { status: 500 },
    )
  }

  let body: VerifyPaymentBody

  try {
    body = (await request.json()) as VerifyPaymentBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    orderId,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
    customer,
  } = body

  if (
    !orderId ||
    !razorpayOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature
  ) {
    return NextResponse.json(
      { error: 'Missing payment verification fields' },
      { status: 400 },
    )
  }

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')

  const providedBuffer = Buffer.from(razorpaySignature)
  const expectedBuffer = Buffer.from(expectedSignature)

  const isValidSignature =
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)

  if (!isValidSignature) {
    await logAction(
      'store',
      `Razorpay signature mismatch for order ${orderId}`,
    )
    return NextResponse.json(
      { error: 'Payment signature verification failed' },
      { status: 400 },
    )
  }

  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      customerName: orders.customerName,
      email: orders.email,
    })
    .from(orders)
    .where(
      and(eq(orders.id, orderId), eq(orders.stripeSessionId, razorpayOrderId)),
    )
    .limit(1)

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.status !== 'pending') {
    return NextResponse.json({ success: true, orderId })
  }

  const customerName = customer?.name?.trim() || order.customerName
  const customerEmail = customer?.email?.trim() || order.email

  await db
    .update(orders)
    .set({
      status: 'processing',
      customerName,
      email: customerEmail,
      shippingAddress: customer?.address
        ? {
            name: customerName,
            line1: customer.address.line1 ?? '',
            city: customer.address.city ?? '',
            state: customer.address.state ?? '',
            postal_code: customer.address.postal_code ?? '',
            country: customer.address.country ?? '',
            phone: customer.phone,
          }
        : undefined,
      statusUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))

  await db.insert(orderStatusHistory).values({
    orderId,
    status: 'processing',
    note: `Razorpay payment ${razorpayPaymentId}`,
  })

  await logAction(
    'store',
    `Razorpay payment verified for order ${orderId} (${razorpayPaymentId})`,
  )

  return NextResponse.json({ success: true, orderId })
}
