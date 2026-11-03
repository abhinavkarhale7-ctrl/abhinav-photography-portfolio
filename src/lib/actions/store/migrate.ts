'use server'

import { db } from '~/server/db'
import {
  products,
  productSizes,
  basePrintSizes,
  imageData,
} from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { slugify } from '~/lib/utils'
import { requireAdminAuth } from '~/lib/auth/permissions'
import { revalidatePath } from 'next/cache'

/**
 * Creates a store product for every gallery image that does not already have
 * one, using the active base print sizes. Duplicates are skipped by image URL
 * and slug collisions are resolved, so running it twice is safe.
 */
export async function migrateImagesToProducts() {
  await requireAdminAuth()

  try {
    const sizes = await db
      .select()
      .from(basePrintSizes)
      .where(eq(basePrintSizes.active, true))

    if (sizes.length === 0) {
      return {
        success: false,
        error:
          'Add at least one print size under Costs → Print Sizes before importing products.',
      }
    }

    const images = await db.select().from(imageData)

    let created = 0
    let skipped = 0

    for (const image of images) {
      const [existing] = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.imageUrl, image.fileUrl))
        .limit(1)

      if (existing) {
        skipped += 1
        continue
      }

      const baseSlug = slugify(image.name) || 'print'
      let slug = baseSlug
      let suffix = 1

      while (true) {
        const [taken] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.slug, slug))
          .limit(1)

        if (!taken) break

        suffix += 1
        slug = `${baseSlug}-${suffix}`
      }

      const [product] = await db
        .insert(products)
        .values({
          name: image.name,
          slug,
          description: image.description || 'Fine art print',
          imageUrl: image.fileUrl,
          active: true,
        })
        .returning({ id: products.id })

      if (!product) continue

      await db.insert(productSizes).values(
        sizes.map((size) => ({
          productId: product.id,
          name: size.name,
          width: size.width,
          height: size.height,
          // Sell at the configured selling price, never the base cost.
          basePrice: size.sellAtPrice ?? size.basePrice,
          stripeProductId: '',
          stripePriceId: '',
          active: true,
        })),
      )

      created += 1
    }

    revalidatePath('/admin/store')
    revalidatePath('/admin/store/products')
    revalidatePath('/store')

    if (created === 0) {
      return {
        success: true,
        message: `No new products needed. ${skipped} image(s) already have a product.`,
      }
    }

    return {
      success: true,
      message: `Created ${created} product(s)${
        skipped > 0 ? `, skipped ${skipped} already in the store` : ''
      }. They are live in the store — switch any off from the Products tab.`,
    }
  } catch (error) {
    console.error('Failed to import gallery images as products:', error)
    return {
      success: false,
      error: 'Failed to import images. Check the server logs for details.',
    }
  }
}
