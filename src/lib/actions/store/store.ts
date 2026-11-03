'use server'

import { getRazorpayKeyId, requireRazorpay } from '~/lib/razorpay'
import { db, dbWithTx } from '~/server/db'
import {
  orders,
  products,
  productSizes,
  storeCosts,
  shippingMethods,
  basePrintSizes,
} from '~/server/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireAdminAuth } from '~/lib/auth/permissions'
import { logAction } from '~/lib/logging'
import { isStoreEnabledServer } from '~/lib/store-utils'
import {
  createCheckoutSessionSchema,
  updateOrderStatusSchema,
  updateTaxRatesSchema
} from '~/lib/validations/store'

export async function createCheckoutSession(
  productId: string,
  sizeId: string,
  shippingMethodId: string,
) {
  if (!isStoreEnabledServer()) {
    throw new Error('Store is not available')
  }

  const validatedInput = createCheckoutSessionSchema.safeParse({
    productId,
    sizeId,
    shippingMethodId,
  })

  if (!validatedInput.success) {
    await logAction(
      'store',
      `Invalid checkout session input: ${validatedInput.error.message}`,
    )
    throw new Error('Invalid input parameters')
  }

  const {
    productId: validProductId,
    sizeId: validSizeId,
    shippingMethodId: validShippingMethodId,
  } = validatedInput.data

  try {
    const orderDetails = await calculateOrderTotal(
      validProductId,
      validSizeId,
      validShippingMethodId,
    )

    if (orderDetails.total < 100) {
      throw new Error('Order total must be at least 100 paise')
    }

    const razorpay = requireRazorpay()

    const razorpayOrder = await razorpay.orders.create({
      amount: orderDetails.total,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        productId: validProductId,
        sizeId: validSizeId,
        shippingMethodId: validShippingMethodId,
      },
    })

    const [order] = await db
      .insert(orders)
      .values({
        stripeSessionId: razorpayOrder.id,
        customerName: '',
        email: '',
        productId: validProductId,
        sizeId: validSizeId,
        shippingMethodId: validShippingMethodId,
        status: 'pending',
        subtotal: orderDetails.subtotal,
        shippingCost: orderDetails.shippingCost,
        tax: orderDetails.tax,
        total: orderDetails.total,
        currency: 'inr',
      })
      .returning()

    if (!order) {
      throw new Error('Failed to create order')
    }

    await logAction(
      'store',
      `Razorpay order ${razorpayOrder.id} created for order ${order.id}`,
    )

    return {
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      amount: orderDetails.total,
      currency: 'INR',
      keyId: getRazorpayKeyId(),
    }
  } catch (error) {
    await logAction(
      'store',
      `Checkout session creation failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
    throw new Error('Failed to create checkout session')
  }
}
// Helper function to calculate order total with proper validation
async function calculateOrderTotal(productId: string, sizeId: string, shippingMethodId: string) {
  // Get product, size, base size, and shipping method details
  const size = await db
    .select()
    .from(productSizes)
    .where(eq(productSizes.id, sizeId))
    .limit(1)

  if (!size[0]) {
    throw new Error('Product size not found')
  }

  const [product, baseSize, shippingMethod] = await Promise.all([
    db.select().from(products).where(eq(products.id, productId)).limit(1),
    db
      .select()
      .from(basePrintSizes)
      .where(
        and(
          eq(basePrintSizes.width, size[0].width),
          eq(basePrintSizes.height, size[0].height),
          eq(basePrintSizes.active, true),
        ),
      )
      .limit(1),
    db
      .select()
      .from(shippingMethods)
      .where(eq(shippingMethods.id, shippingMethodId))
      .limit(1),
  ])

  if (!product[0] || !size[0] || !baseSize[0] || !shippingMethod[0]) {
    throw new Error('Product, size, base size, or shipping method not found')
  }

  // Calculate the subtotal based on the pricing rules
  let subtotal = baseSize[0].basePrice
  if (baseSize[0].sellAtPrice) {
    subtotal = baseSize[0].sellAtPrice
  }

  const shippingCost = shippingMethod[0].price

  const costs = await db
    .select()
    .from(storeCosts)
    .where(eq(storeCosts.active, true))
    .orderBy(desc(storeCosts.createdAt))
    .limit(1)

  const baseAmount = subtotal + shippingCost // in pence

  // Convert stored tax rates to decimals with safe defaults
  const taxRateDecimal =
    costs[0]?.taxRate !== undefined ? costs[0].taxRate / 10000 : 0.2
  const stripeTaxRateDecimal =
    costs[0]?.stripeTaxRate !== undefined
      ? costs[0].stripeTaxRate / 10000
      : 0.015

  // Calculate the tax amounts (in pence)
  const tax = Math.round(baseAmount * taxRateDecimal)
  const stripeTax = Math.round(baseAmount * stripeTaxRateDecimal)

  // Calculate overall total (in pence)
  const total = baseAmount + tax + stripeTax

  return {
    subtotal,
    shippingCost,
    tax: tax + stripeTax, // Combined tax for storage
    total,
  }
}

export async function updateOrderStatus(
  stripeSessionId: string,
  email: string,
  status: 'processing',
  shipping?: {
    name: string
    address: {
      line1: string
      line2?: string
      city: string
      state: string
      postal_code: string
      country: string
    }
  },
) {
  // Validate inputs
  const validatedInput = updateOrderStatusSchema.safeParse({
    stripeSessionId,
    email,
    status,
    shipping,
  })

  if (!validatedInput.success) {
    await logAction('store', `Invalid order status update input: ${validatedInput.error.message}`)
    return { success: false, error: 'Invalid input parameters' }
  }

  const { stripeSessionId: validSessionId, email: validEmail, status: validStatus, shipping: validShipping } = validatedInput.data

  try {
    const [existingOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.stripeSessionId, validSessionId))
      .limit(1)

    if (!existingOrder) {
      await logAction(
        'store',
        `Order update attempted for unknown payment: ${validSessionId}`,
      )
      return { success: false, error: 'Order not found' }
    }

    // Update existing order in transaction
    const _result = await dbWithTx.transaction(async (tx) => {
      const updateResult = await tx
        .update(orders)
        .set({
          status: validStatus,
          email: validEmail,
          customerName: validShipping?.name,
          shippingAddress: validShipping
            ? {
                name: validShipping.name,
                line1: validShipping.address.line1,
                line2: validShipping.address.line2,
                city: validShipping.address.city,
                state: validShipping.address.state,
                postal_code: validShipping.address.postal_code,
                country: validShipping.address.country,
              }
            : undefined,
          statusUpdatedAt: new Date(),
        })
        .where(eq(orders.stripeSessionId, validSessionId))

      await logAction('store', `Order status updated for payment intent: ${validSessionId}`)
      return updateResult
    })

    return { success: true }
  } catch (error) {
    await logAction('store', `Failed to update order: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return { success: false, error: 'Failed to update order' }
  }
}

export async function updateTaxRates(
  taxRate: number, 
  stripeRate: number,
  profitPercentage: number
) {
  // Require admin authorization
  await requireAdminAuth()

  // Validate inputs
  const validatedInput = updateTaxRatesSchema.safeParse({
    taxRate,
    stripeRate,
    profitPercentage,
  })

  if (!validatedInput.success) {
    await logAction('store', `Invalid tax rates update input: ${validatedInput.error.message}`)
    return { success: false, error: 'Invalid input parameters' }
  }

  const { taxRate: validTaxRate, stripeRate: validStripeRate, profitPercentage: validProfitPercentage } = validatedInput.data

  try {
    await dbWithTx.transaction(async (tx) => {
      // Deactivate existing rates
      await tx
        .update(storeCosts)
        .set({ active: false })
        .where(eq(storeCosts.active, true))

      // Convert percentages to integer storage format (percentage * 10000)
      const taxRateInt = Math.round(validTaxRate * 10000) // Store as percentage * 10000
      const stripeRateInt = Math.round(validStripeRate * 10000)
      const profitPercentageInt = Math.round(validProfitPercentage * 10000)

      // Insert new rates
      await tx.insert(storeCosts).values({
        taxRate: taxRateInt,
        stripeTaxRate: stripeRateInt,
        profitPercentage: profitPercentageInt,
        active: true,
      })
    })

    await logAction('store', `Tax rates updated: tax=${validTaxRate}, gatewayFee=${validStripeRate}, profit=${validProfitPercentage}`)
    revalidatePath('/admin/store/costs')
    return { success: true }
  } catch (error) {
    await logAction('store', `Error updating tax rates: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return { success: false, error: 'Failed to update tax rates' }
  }
}

export async function getTaxRates() {
  try {
    const costs = await db
      .select()
      .from(storeCosts)
      .where(eq(storeCosts.active, true))
      .orderBy(desc(storeCosts.createdAt))
      .limit(1)

    if (!costs.length) {
      return {
        taxRate: 2000,
        stripeTaxRate: 150,
        profitPercentage: 2000, // 20% default profit
      }
    }

    return {
      taxRate: costs[0].taxRate,
      stripeTaxRate: costs[0].stripeTaxRate,
      profitPercentage: costs[0].profitPercentage,
    }
  } catch (error) {
    console.error('Error fetching tax rates:', error)
    return null
  }
}
