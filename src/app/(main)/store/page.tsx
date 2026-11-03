import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '~/server/db'
import { and, eq, desc } from 'drizzle-orm'
import { products, productSizes, storeCosts } from '~/server/db/schema'
import { StorePage } from '~/components/store/store-page'
import { isStoreEnabledServer } from '~/lib/store-utils'
import { generateStoreStructuredData, generateBreadcrumbStructuredData } from '~/lib/structured-data'
import { siteConfig } from '~/config/site'

export const metadata: Metadata = {
  title: 'Print Store | Photography Portfolio',
  description: 'Purchase beautiful photographic prints from our curated collection. High-quality wall art for your home and office.',
  openGraph: {
    title: 'Print Store | Photography Portfolio',
    description: 'Purchase beautiful photographic prints from our curated collection',
    type: 'website',
  },
  keywords: ['photography prints', 'wall art', 'home decor', 'fine art photography', 'photographic prints'],
}

// Always render fresh: prices and availability come from admin edits and must
// never lag behind a cached copy.
export const dynamic = 'force-dynamic'

async function getProducts() {
  // Only products the admin has switched on are purchasable.
  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.active, true))
  const costs = await db
    .select()
    .from(storeCosts)
    .where(eq(storeCosts.active, true))
    .orderBy(desc(storeCosts.createdAt))
    .limit(1)

  // Get the base prices for each product
  const productsWithPrices = await Promise.all(
    allProducts.map(async (product) => {
      const sizes = await db
        .select()
        .from(productSizes)
        .where(and(eq(productSizes.productId, product.id), eq(productSizes.active, true)))
        .orderBy(productSizes.basePrice)

      // Nothing to sell without an active print size.
      if (sizes.length === 0) return null

      const lowestPrice = sizes[0]?.basePrice ?? 0
      // Nullish fallbacks: a saved 0% must stay 0%, otherwise the displayed
      // price would include a fee the customer is never charged.
      const taxRate = costs[0]?.taxRate ?? 2000
      const stripeTaxRate = costs[0]?.stripeTaxRate ?? 150
      
      let displayPrice = lowestPrice
      if (!siteConfig.features.store.showTax) {
        // Include tax in displayed price when showTax is false
        // Match backend calculation: apply both taxes to base amount
        const totalTaxRate = (taxRate + stripeTaxRate) / 10000
        displayPrice = Math.round(lowestPrice * (1 + totalTaxRate))
      }

      return {
        ...product,
        priceWithTax: displayPrice,
      }
    })
  )

  return productsWithPrices.filter(
    (product): product is NonNullable<typeof product> => product !== null,
  )
}

export default async function StorePageWrapper() {
  // Return 404 if store is disabled
  if (!isStoreEnabledServer()) {
    notFound()
  }

  const prints = await getProducts()
  const baseUrl = siteConfig.url || 'http://localhost:3000'

  // Generate structured data
  const storeStructuredData = generateStoreStructuredData({
    products: prints,
    baseUrl
  })

  const breadcrumbStructuredData = generateBreadcrumbStructuredData([
    { name: 'Home', url: baseUrl },
    { name: 'Store', url: `${baseUrl}/store` }
  ])

  return (
    <>
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(storeStructuredData)
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbStructuredData)
        }}
      />

      <StorePage initialProducts={prints} />
    </>
  )
}
