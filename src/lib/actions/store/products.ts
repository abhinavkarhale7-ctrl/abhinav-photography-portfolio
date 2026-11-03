'use server'

import { z } from 'zod'

import { requireAdminAuth } from '~/lib/auth/permissions'
import { slugify } from '~/lib/utils'
import { revalidatePath } from 'next/cache'
import { db } from '~/server/db'
import { basePrintSizes, products, productSizes } from '~/server/db/schema'
import { eq, or } from 'drizzle-orm'

export async function getAllProducts() {
  try {
    const allProducts = await db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        imageUrl: products.imageUrl,
        active: products.active,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .orderBy(products.name)

    return { success: true, data: allProducts }
  } catch (error) {
    console.error('Failed to get products:', error)
    return { success: false, error: 'Failed to fetch products' }
  }
}

export async function getProductWithSizes(productId: string) {
  try {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1)

    if (!product) {
      return { success: false, error: 'Product not found' }
    }

    const sizes = await db
      .select()
      .from(productSizes)
      .where(eq(productSizes.productId, productId))

    return {
      success: true,
      data: {
        ...product,
        sizes: sizes.map((size) => ({
          id: size.id,
          name: size.name,
          width: size.width,
          height: size.height,
          basePrice: size.basePrice,
          active: size.active,
        })),
      },
    }
  } catch (error) {
    console.error('Failed to get product with sizes:', error)
    return { success: false, error: 'Failed to fetch product' }
  }
}

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim().max(5000).default(''),
  imageUrl: z.string().trim().url('Enter a valid image URL'),
  active: z.boolean().default(true),
})

export async function createProduct(input: unknown) {
  await requireAdminAuth()

  const parsed = createProductSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid product details',
    }
  }

  try {
    const sizes = await db
      .select()
      .from(basePrintSizes)
      .where(eq(basePrintSizes.active, true))

    if (sizes.length === 0) {
      return {
        success: false,
        error:
          'Add at least one print size under Costs → Print Sizes before creating a product.',
      }
    }

    // Refuse to create a second product for the same print. Re-adding a photo
    // used to produce duplicate storefront entries, so point at the existing
    // product instead.
    const [existingProduct] = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(
        or(
          eq(products.name, parsed.data.name),
          eq(products.imageUrl, parsed.data.imageUrl),
        ),
      )
      .limit(1)

    if (existingProduct) {
      return {
        success: false,
        error: `"${existingProduct.name}" is already in the store. Turn it on in Products instead of adding it again.`,
      }
    }

    const baseSlug = slugify(parsed.data.name) || 'print'
    let slug = baseSlug
    let suffix = 1

    while (true) {
      const [existing] = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.slug, slug))
        .limit(1)

      if (!existing) break

      suffix += 1
      slug = `${baseSlug}-${suffix}`
    }

    const [product] = await db
      .insert(products)
      .values({
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        imageUrl: parsed.data.imageUrl,
        active: parsed.data.active,
      })
      .returning({ id: products.id })

    if (!product) {
      return { success: false, error: 'Failed to create product' }
    }

    await db.insert(productSizes).values(
      sizes.map((size) => ({
        productId: product.id,
        name: size.name,
        width: size.width,
        height: size.height,
        basePrice: size.sellAtPrice ?? size.basePrice,
        stripeProductId: '',
        stripePriceId: '',
        active: true,
      })),
    )

    revalidatePath('/store')
    revalidatePath('/admin/store')

    return { success: true, productId: product.id }
  } catch (error) {
    console.error('Failed to create product:', error)
    return { success: false, error: 'Failed to create product' }
  }
}

/**
 * Turns a product on or off in the storefront without deleting it.
 */
export async function setProductActive(productId: string, active: boolean) {
  await requireAdminAuth()

  try {
    const [updated] = await db
      .update(products)
      .set({ active, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning({ id: products.id, active: products.active })

    if (!updated) {
      return { success: false, error: 'Product not found' }
    }

    revalidatePath('/store')
    revalidatePath('/admin/store')
    revalidatePath('/admin/store/products')

    return { success: true, active: updated.active }
  } catch (error) {
    console.error('Failed to update product status:', error)
    return { success: false, error: 'Failed to update product status' }
  }
}

/**
 * Rebuilds product sizes from the active base print sizes. Needed when print
 * sizes are added after products already exist, otherwise those products have
 * nothing to sell.
 */
export async function syncProductSizesFromBase() {
  await requireAdminAuth()

  try {
    const sizes = await db
      .select()
      .from(basePrintSizes)
      .where(eq(basePrintSizes.active, true))

    if (sizes.length === 0) {
      return {
        success: false,
        error: 'Add print sizes under Costs → Print Sizes first.',
      }
    }

    const allProducts = await db.select({ id: products.id }).from(products)

    for (const product of allProducts) {
      const existing = await db
        .select({ id: productSizes.id, name: productSizes.name })
        .from(productSizes)
        .where(eq(productSizes.productId, product.id))

      const byName = new Map(existing.map((row) => [row.name, row.id]))

      for (const size of sizes) {
        const price = size.sellAtPrice ?? size.basePrice
        const existingId = byName.get(size.name)

        if (existingId) {
          await db
            .update(productSizes)
            .set({
              width: size.width,
              height: size.height,
              basePrice: price,
              active: true,
              updatedAt: new Date(),
            })
            .where(eq(productSizes.id, existingId))
        } else {
          await db.insert(productSizes).values({
            productId: product.id,
            name: size.name,
            width: size.width,
            height: size.height,
            basePrice: price,
            stripeProductId: '',
            stripePriceId: '',
            active: true,
          })
        }
      }
    }

    revalidatePath('/store')
    revalidatePath('/admin/store')
    revalidatePath('/admin/store/products')

    return {
      success: true,
      products: allProducts.length,
      sizes: sizes.length,
    }
  } catch (error) {
    console.error('Failed to sync product sizes:', error)
    return { success: false, error: 'Failed to sync product sizes' }
  }
}