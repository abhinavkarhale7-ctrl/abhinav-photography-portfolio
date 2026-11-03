import { notFound } from 'next/navigation'
import { isStoreEnabledServer } from '~/lib/store-utils'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  // Return 404 if store is disabled
  if (!isStoreEnabledServer()) {
    notFound()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">{children}</main>
    </div>
  )
}