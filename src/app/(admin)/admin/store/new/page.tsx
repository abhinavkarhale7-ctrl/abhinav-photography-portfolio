import { notFound } from 'next/navigation'

import { NewProductForm } from '~/components/store/admin/new-product-form'
import { getSession } from '~/lib/auth/auth'

export const metadata = {
  title: 'Add Product | Admin',
  description: 'Create a new print product',
}

export default async function NewProductPage() {
  const session = await getSession()

  if (!session || session.role !== 'admin') {
    notFound()
  }

  return (
    <main className="container mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Add Product</h1>
        <p className="text-muted-foreground text-sm">
          Prices for each print size come from Store → Costs.
        </p>
      </div>
      <NewProductForm />
    </main>
  )
}
