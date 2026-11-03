'use server'

import { requireAdminAuth } from '~/lib/auth/permissions'
import { dbWithTx as db } from '~/server/db'
import { orders, products, productSizes } from '~/server/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export interface DeleteStoreResult {
  success: boolean
  message?: string
  error?: string
}

export async function deleteAllProducts(): Promise<DeleteStoreResult> {
  await requireAdminAuth()

  try {
    const allProducts = await db.select({ id: products.id }).from(products)

    const ids = allProducts.map((product) => product.id)

    if (ids.length === 0) {
      return { success: true, message: 'There are no products to delete' }
    }

    // Products that already have orders must be kept for order history.
    const ordered = await db
      .selectDistinct({ productId: orders.productId })
      .from(orders)

    const orderedIds = new Set(
      ordered
        .map((row) => row.productId)
        .filter((id): id is string => typeof id === 'string'),
    )

    const deletableIds = ids.filter((id) => !orderedIds.has(id))

    await db.transaction(async (tx) => {
      if (deletableIds.length > 0) {
        await tx
          .delete(productSizes)
          .where(inArray(productSizes.productId, deletableIds))
        await tx.delete(products).where(inArray(products.id, deletableIds))
      }

      if (orderedIds.size > 0) {
        await tx
          .update(products)
          .set({ active: false, updatedAt: new Date() })
          .where(
            inArray(
              products.id,
              ids.filter((id) => orderedIds.has(id)),
            ),
          )
      }
    })

    revalidatePath('/store')
    revalidatePath('/admin/store')

    return {
      success: true,
      message: `Deleted ${deletableIds.length} product(s); ${orderedIds.size} with orders were hidden instead`,
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