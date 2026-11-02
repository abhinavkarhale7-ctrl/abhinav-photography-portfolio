'use server'

import { requireStripe } from '~/lib/stripe'
import { requireAdminAuth } from '~/lib/auth/permissions'
import { dbWithTx as db } from '~/server/db'
import { orders, products, productSizes } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export interface DeleteStoreResult {
  success: boolean
  message?: string
  error?: string
}

export async function deleteAllProducts(): Promise<DeleteStoreResult> {
  try {
    const stripe = requireStripe()
    
    // Get all products with their sizes
    const allProducts = await db
      .select()
      .from(products)
      .leftJoin(productSizes, eq(products.id, productSizes.productId))

    // Start a transaction to ensure data consistency
    await db.transaction(async (tx) => {
      for (const product of allProducts) {
        if (product.productSizes) {
          // Delete Stripe product and price
          await stripe.products.del(product.productSizes.stripeProductId)
        }

        // Delete product sizes
        await tx
          .delete(productSizes)
          .where(eq(productSizes.productId, product.products.id))

        // Delete the product
        await tx.delete(products).where(eq(products.id, product.products.id))
      }
    })

    revalidatePath('/admin/store')

    return {
      success: true,
      message: `Successfully deleted ${allProducts.length} products and their associated data`,
    }
  } catch (error) {
    console.error('Error deleting store products:', error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to delete products',
    }
  }
}

export async function deleteProduct(productId: string): Promise<DeleteStoreResult> {
  await requireAdminAuth()

  try {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1)

    if (!product) {
      return { success: false, error: 'Product not found' }
    }

    const [existingOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.productId, productId))
      .limit(1)

    if (existingOrder) {
      await db
        .update(products)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(products.id, productId))

      revalidatePath('/store')
      revalidatePath('/admin/store')

      return {
        success: true,
        message: 'Product has orders, so it was hidden from the store instead of deleted',
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(productSizes)
        .where(eq(productSizes.productId, productId))
      await tx.delete(products).where(eq(products.id, productId))
    })

    revalidatePath('/store')
    revalidatePath('/admin/store')

    return { success: true, message: 'Product deleted' }
  } catch (error) {
    console.error('Error deleting product:', error)
    return { success: false, error: 'Failed to delete product' }
  }
}