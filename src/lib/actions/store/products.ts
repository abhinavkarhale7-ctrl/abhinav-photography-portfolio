'use server'

import { z } from 'zod'

import { requireAdminAuth } from '~/lib/auth/permissions'
import { slugify } from '~/lib/utils'
import { revalidatePath } from 'next/cache'
import { db } from '~/server/db'
import { basePrintSizes, products, productSizes } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

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

    const sizes = await db
      .select()
      .from(basePrintSizes)
      .where(eq(basePrintSizes.active, true))

    if (sizes.length > 0) {
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
    }

    revalidatePath('/store')
    revalidatePath('/admin/store')

    return { success: true, productId: product.id }
  } catch (error) {
    console.error('Failed to create product:', error)
    return { success: false, error: 'Failed to create product' }
  }
}