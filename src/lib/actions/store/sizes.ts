'use server'

import { requireAdminAuth } from '~/lib/auth/permissions'
import { db, dbWithTx } from '~/server/db'
import { basePrintSizes, products, productSizes } from '~/server/db/schema'
import { revalidatePath } from 'next/cache'
import { eq, and, or, inArray } from 'drizzle-orm'

export async function addPrintSize(data: {
  name: string
  width: number
  height: number
  basePrice: number
  sellAtPrice: number
}) {
  try {
    const [size] = await db
      .insert(basePrintSizes)
      .values({
        name: data.name,
        width: data.width,
        height: data.height,
        basePrice: data.basePrice,
        sellAtPrice: data.sellAtPrice,
      })
      .returning()

    if (!size) {
      return { success: false, error: 'Failed to add size' }
    }

    // Offer the new size on every existing product, otherwise those products
    // stay unbuyable until someone syncs them by hand.
    const allProducts = await db.select({ id: products.id }).from(products)
    const price = data.sellAtPrice > 0 ? data.sellAtPrice : data.basePrice

    for (const product of allProducts) {
      const [existing] = await db
        .select({ id: productSizes.id })
        .from(productSizes)
        .where(
          and(
            eq(productSizes.productId, product.id),
            eq(productSizes.name, data.name),
          ),
        )
        .limit(1)

      if (existing) continue

      await db.insert(productSizes).values({
        productId: product.id,
        name: data.name,
        width: data.width,
        height: data.height,
        basePrice: price,
        stripeProductId: '',
        stripePriceId: '',
        active: true,
      })
    }

    revalidatePath('/admin/store/costs')
    revalidatePath('/admin/store')
    revalidatePath('/admin/store/products')
    revalidatePath('/store')
    return { success: true, data: size }
  } catch (_error) {
    return { success: false, error: 'Failed to add size' }
  }
}

export async function updatePrintSize(
  id: string,
  data: {
    name: string
    width: number
    height: number
    basePrice: number
    sellAtPrice: number
  },
) {
  try {
    const [existing] = await db
      .select()
      .from(basePrintSizes)
      .where(eq(basePrintSizes.id, id))
      .limit(1)

    const [size] = await db
      .update(basePrintSizes)
      .set({
        name: data.name,
        width: data.width,
        height: data.height,
        basePrice: data.basePrice,
        sellAtPrice: data.sellAtPrice,
        updatedAt: new Date(),
      })
      .where(eq(basePrintSizes.id, id))
      .returning()

    // Keep product sizes in sync so the price shown on the store matches the
    // price charged at checkout (checkout reads the base size).
    if (existing) {
      const effectivePrice =
        data.sellAtPrice > 0 ? data.sellAtPrice : data.basePrice

      await db
        .update(productSizes)
        .set({
          name: data.name,
          width: data.width,
          height: data.height,
          basePrice: effectivePrice,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(productSizes.width, existing.width),
            eq(productSizes.height, existing.height),
          ),
        )
    }

    revalidatePath('/admin/store/costs')
    revalidatePath('/admin/store')
    revalidatePath('/admin/store/products')
    revalidatePath('/store')
    return { success: true, data: size }
  } catch (error) {
    console.error('Failed to update print size:', error)
    return { success: false, error: 'Failed to update size' }
  }
}

export async function applyPrintSizeTemplate(
  templateSizes: {
    name: string
    width: number
    height: number
    basePrice: number
  }[],
  conflictResolutions: Record<
    string,
    { action: 'overwrite' | 'skip' | 'both'; existingId?: string }
  >,
) {
  try {
    const results = {
      added: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    }

    for (const templateSize of templateSizes) {
      try {
        // Derive a deterministic key expected from the UI layer:
        // e.g. "NAME:WIDTHxHEIGHT"
        const conflictKey = `${templateSize.name}:${templateSize.width}x${templateSize.height}`
        const resolution = conflictResolutions[conflictKey] ?? null

        if (resolution) {
          switch (resolution.action) {
            case 'overwrite':
              if (resolution.existingId) {
                await db
                  .update(basePrintSizes)
                  .set({
                    name: templateSize.name,
                    width: templateSize.width,
                    height: templateSize.height,
                    basePrice: templateSize.basePrice,
                    updatedAt: new Date(),
                  })
                  .where(eq(basePrintSizes.id, resolution.existingId))
                results.updated++
              }
              break

            case 'both':
              // Add with modified name
              await db.insert(basePrintSizes).values({
                name: `${templateSize.name} (New)`,
                width: templateSize.width,
                height: templateSize.height,
                basePrice: templateSize.basePrice,
                sellAtPrice: null,
              })
              results.added++
              break

            case 'skip':
              results.skipped++
              break
          }
        } else {
          // No conflict, add normally
          await db.insert(basePrintSizes).values({
            name: templateSize.name,
            width: templateSize.width,
            height: templateSize.height,
            basePrice: templateSize.basePrice,
            sellAtPrice: null,
          })
          results.added++
        }
      } catch (error) {
        results.errors.push(`Failed to process ${templateSize.name}: ${error}`)
      }
    }

    revalidatePath('/admin/store/costs')
    revalidatePath('/admin/store')
    revalidatePath('/admin/store/products')
    return { success: true, data: results }
  } catch (error) {
    console.error('Failed to apply template:', error)
    return { success: false, error: 'Failed to apply print size template' }
  }
}

export async function applyPrintSizesToProducts(
  baseSizeIds: string[],
  productIds: string[],
  conflictResolutions: Record<
    string,
    { action: 'overwrite' | 'skip' | 'both'; existingId?: string }
  >,
) {
  try {
    const results = {
      productsUpdated: 0,
      sizesAdded: 0,
      sizesUpdated: 0,
      sizesSkipped: 0,
      errors: [] as string[],
    }

    // Get the base sizes to apply
    const baseSizes = await db
      .select()
      .from(basePrintSizes)
      .where(inArray(basePrintSizes.id, baseSizeIds))

    if (baseSizes.length === 0) {
      return { success: false, error: 'No valid base sizes found' }
    }

    for (const productId of productIds) {
      try {
        let productSizesAdded = 0

        for (const baseSize of baseSizes) {
          const conflictKey = `${productId}-${baseSize.name}`
          const resolution = conflictResolutions[conflictKey]

          // Check if this product already has a size with the same name or dimensions
          const existingSize = await db
            .select()
            .from(productSizes)
            .where(
              and(
                eq(productSizes.productId, productId),
                or(
                  eq(productSizes.name, baseSize.name),
                  and(
                    eq(productSizes.width, baseSize.width),
                    eq(productSizes.height, baseSize.height),
                  ),
                ),
              ),
            )
            .limit(1)

          if (existingSize.length > 0) {
            if (resolution) {
              switch (resolution.action) {
                case 'overwrite':
                  await db
                    .update(productSizes)
                    .set({
                      name: baseSize.name,
                      width: baseSize.width,
                      height: baseSize.height,
                      basePrice: baseSize.basePrice,
                      updatedAt: new Date(),
                    })
                    .where(eq(productSizes.id, existingSize[0].id))
                  results.sizesUpdated++
                  break

                case 'both':
                  // Create new size with modified name
                  await db.insert(productSizes).values({
                    productId,
                    name: `${baseSize.name} (Alt)`,
                    width: baseSize.width,
                    height: baseSize.height,
                    basePrice: baseSize.basePrice,
                    stripeProductId: `temp_${Date.now()}_${Math.random()}`,
                    stripePriceId: `temp_${Date.now()}_${Math.random()}`,
                  })
                  results.sizesAdded++
                  productSizesAdded++
                  break

                case 'skip':
                  results.sizesSkipped++
                  break
              }
            } else {
              results.sizesSkipped++
            }
          } else {
            // No conflict, add new size
            await db.insert(productSizes).values({
              productId,
              name: baseSize.name,
              width: baseSize.width,
              height: baseSize.height,
              basePrice: baseSize.basePrice,
              stripeProductId: `temp_${Date.now()}_${Math.random()}`,
              stripePriceId: `temp_${Date.now()}_${Math.random()}`,
            })
            results.sizesAdded++
            productSizesAdded++
          }
        }

        if (productSizesAdded > 0) {
          results.productsUpdated++
        }
      } catch (error) {
        results.errors.push(`Failed to process product ${productId}: ${error}`)
      }
    }

    revalidatePath('/admin/store/products')
    revalidatePath('/admin/store/costs')
    return { success: true, data: results }
  } catch (error) {
    console.error('Failed to apply sizes to products:', error)
    return { success: false, error: 'Failed to apply sizes to products' }
  }
}

export async function deletePrintSize(id: string) {
  await requireAdminAuth()

  try {
    const [existing] = await db
      .select()
      .from(basePrintSizes)
      .where(eq(basePrintSizes.id, id))
      .limit(1)

    await db.delete(basePrintSizes).where(eq(basePrintSizes.id, id))

    // Without a base size the checkout cannot price this size, so hide the
    // matching product sizes instead of leaving them unbuyable.
    if (existing) {
      await db
        .update(productSizes)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(productSizes.width, existing.width),
            eq(productSizes.height, existing.height),
          ),
        )
    }

    revalidatePath('/admin/store/costs')
    revalidatePath('/admin/store/products')
    revalidatePath('/admin/store')
    revalidatePath('/store')

    return { success: true }
  } catch (error) {
    console.error('Failed to delete print size:', error)
    return { success: false, error: 'Failed to delete print size' }
  }
}

export async function bulkDeactivatePrintSizes(ids: string[]) {
  await requireAdminAuth()

  try {
    const sizes = await db
      .select()
      .from(basePrintSizes)
      .where(inArray(basePrintSizes.id, ids))

    await db
      .update(basePrintSizes)
      .set({ active: false, updatedAt: new Date() })
      .where(inArray(basePrintSizes.id, ids))

    for (const size of sizes) {
      await db
        .update(productSizes)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(productSizes.width, size.width),
            eq(productSizes.height, size.height),
          ),
        )
    }

    revalidatePath('/admin/store/costs')
    revalidatePath('/admin/store/products')
    revalidatePath('/admin/store')
    revalidatePath('/store')

    return { success: true }
  } catch (error) {
    console.error('Failed to deactivate print sizes:', error)
    return { success: false, error: 'Failed to deactivate print sizes' }
  }
}

export async function updateBulkPrices(
  updates: Array<{ id: string; sellAtPrice: number }>,
) {
  await requireAdminAuth()

  try {
    await dbWithTx.transaction(async (tx) => {
      for (const update of updates) {
        const [size] = await tx
          .select()
          .from(basePrintSizes)
          .where(eq(basePrintSizes.id, update.id))
          .limit(1)

        if (!size) continue

        await tx
          .update(basePrintSizes)
          .set({ sellAtPrice: update.sellAtPrice, updatedAt: new Date() })
          .where(eq(basePrintSizes.id, update.id))

        // Mirror the new price onto product sizes with the same dimensions so
        // the store shows exactly what Razorpay will charge.
        await tx
          .update(productSizes)
          .set({
            basePrice:
              update.sellAtPrice > 0 ? update.sellAtPrice : size.basePrice,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(productSizes.width, size.width),
              eq(productSizes.height, size.height),
            ),
          )
      }
    })

    revalidatePath('/admin/store/costs')
    revalidatePath('/admin/store/products')
    revalidatePath('/admin/store')
    revalidatePath('/store')

    return { success: true }
  } catch (error) {
    console.error('Failed to update prices:', error)
    return { success: false, error: 'Failed to update prices' }
  }
}