import { notFound } from 'next/navigation'
import { db } from '~/server/db'
import { products, productSizes, orders, shippingMethods, storeCosts } from '~/server/db/schema'
import { count, desc, eq } from 'drizzle-orm'
import { AdminOrders } from '~/components/store/admin/orders'
import { AdminProducts } from '~/components/store/admin/products'
import { AdminActions } from '~/components/store/admin/actions' 
import { PaymentsPanel } from '~/components/store/admin/payments'
import { StoreAnalytics } from '~/components/store/admin/store-analytics'
import { getSession } from '~/lib/auth/auth'
import { isStoreEnabledServer } from '~/lib/store-utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Store Management - Admin',
  description: 'Manage products, orders, and store settings'
}

export const dynamic = 'force-dynamic'

async function getProducts() {
  const rows = await db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt))

  const sizeCounts = await db
    .select({ productId: productSizes.productId, total: count() })
    .from(productSizes)
    .where(eq(productSizes.active, true))
    .groupBy(productSizes.productId)

  const sizeMap = new Map(
    sizeCounts.map((row) => [row.productId, Number(row.total)]),
  )

  return rows.map((product) => ({
    ...product,
    sizeCount: sizeMap.get(product.id) ?? 0,
  }))
}

async function getRecentOrders() {
  return await db.select({
    id: orders.id,
    orderNumber: orders.orderNumber,
    createdAt: orders.createdAt,
    updatedAt: orders.updatedAt,
    productId: orders.productId,
    sizeId: orders.sizeId,
    shippingMethodId: orders.shippingMethodId,
    stripeSessionId: orders.stripeSessionId,
    status: orders.status,
    customerName: orders.customerName,
    email: orders.email,
    subtotal: orders.subtotal,
    shippingCost: orders.shippingCost,
    tax: orders.tax,
    total: orders.total,
    currency: orders.currency,
    shippingAddress: orders.shippingAddress,
    trackingNumber: orders.trackingNumber,
    statusUpdatedAt: orders.statusUpdatedAt,
    product: products,
    size: productSizes,
    shippingMethod: shippingMethods,
  }).from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .leftJoin(productSizes, eq(orders.sizeId, productSizes.id))
    .leftJoin(shippingMethods, eq(orders.shippingMethodId, shippingMethods.id))
    .orderBy(desc(orders.createdAt))
}

async function getAllOrders() {
  return await db.select().from(orders).orderBy(desc(orders.createdAt))
}

async function getPaymentSettings() {
  const costs = await db
    .select({ gatewayFee: storeCosts.stripeTaxRate })
    .from(storeCosts)
    .where(eq(storeCosts.active, true))
    .orderBy(desc(storeCosts.createdAt))
    .limit(1)

  const keyId = process.env.RAZORPAY_KEY_ID ?? ''
  const publicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? keyId
  const configured = Boolean(keyId && process.env.RAZORPAY_KEY_SECRET)
  const mode: 'live' | 'test' | 'unknown' = keyId.startsWith('rzp_live_')
    ? 'live'
    : keyId.startsWith('rzp_test_')
      ? 'test'
      : 'unknown'

  return {
    configured,
    mode,
    // Only the mask ever reaches the client; the secret never leaves the server.
    maskedKeyId: keyId ? `${keyId.slice(0, 8)}••••${keyId.slice(-4)}` : null,
    // Same fallback the storefront uses when no cost row exists.
    gatewayFeePercent: (costs[0]?.gatewayFee ?? 150) / 10000,
    storeEnabled: isStoreEnabledServer(),
    // Orders use the server key; the browser opens the public key.
    keyMismatch: Boolean(keyId && publicKeyId && keyId !== publicKeyId),
  }
}

export default async function AdminStorePage() {
  // Return 404 if store is disabled
  if (!isStoreEnabledServer()) {
    notFound()
  }

  const [storeProducts, recentOrders, allOrders, paymentSettings] =
    await Promise.all([
      getProducts(),
      getRecentOrders(),
      getAllOrders(),
      getPaymentSettings(),
    ])
  const session = await getSession()

  if (!session?.id) {
    throw new Error('Unauthorized: Session ID is required')
  }

  return (
    <main className="container mx-auto px-4 py-12">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">Store Management</h1>
          <p className="text-gray-600 mb-8">Manage your store products, orders, and analytics</p>
          
          <Tabs defaultValue="analytics" className="space-y-6">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-5">
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="analytics" className="space-y-6">
              <StoreAnalytics orders={allOrders} products={storeProducts} />
            </TabsContent>

            <TabsContent value="orders" className="space-y-6">
              <AdminOrders initialOrders={recentOrders} userId={session.id} />
            </TabsContent>

            <TabsContent value="products" className="space-y-6">
              <AdminProducts products={storeProducts} />
            </TabsContent>

            <TabsContent value="payments" className="space-y-6">
              <PaymentsPanel {...paymentSettings} />
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <AdminActions />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  )
}

