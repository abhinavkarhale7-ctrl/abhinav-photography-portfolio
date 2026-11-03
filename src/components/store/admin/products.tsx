'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { Input } from '~/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import type { Product } from '~/server/db/schema'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { Pagination } from '~/components/ui/pagination'
import { memo } from 'react'
import { Loader2, RefreshCw, Search } from 'lucide-react'

import {
  setProductActive,
  syncProductSizesFromBase,
} from '~/lib/actions/store/products'
import { DeleteProductButton } from '~/components/store/admin/delete-product-button'

interface AdminProductsProps {
  products: Array<Product & { sizeCount?: number }>
}

// Separate the product row into its own memoized component
const ProductRow = memo(function ProductRow({
  product,
}: {
  product: Product & { sizeCount?: number }
}) {
  const router = useRouter()
  const [active, setActive] = useState(product.active)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setActive(product.active)
  }, [product.active])

  const handleToggle = async (next: boolean) => {
    setActive(next)
    setSaving(true)

    try {
      const result = await setProductActive(product.id, next)

      if (!result.success) {
        setActive(!next)
        toast.error(result.error ?? 'Could not update this product')
        return
      }

      toast.success(
        next ? 'Product is live in the store' : 'Product hidden from the store',
      )
      router.refresh()
    } catch (error) {
      console.error('Failed to update product status:', error)
      setActive(!next)
      toast.error('Could not update this product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="relative aspect-3/2 w-20">
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="80px"
            loading="lazy"
            className="rounded-md object-cover"
          />
        </div>
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex flex-col gap-1">
          <span>{product.name}</span>
          {product.sizeCount === 0 && (
            <span className="text-amber-600 text-xs font-normal">
              No print sizes — run “Sync print sizes”
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-xs truncate">{product.description}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={active}
            disabled={saving}
            onCheckedChange={handleToggle}
            aria-label={`${active ? 'Hide' : 'Show'} ${product.name}`}
          />
          <span className="text-muted-foreground text-xs">
            {active ? 'Live' : 'Hidden'}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/store/products/${product.id}`}>Edit</Link>
          </Button>
          <DeleteProductButton
            productId={product.id}
            productName={product.name}
            compact
          />
        </div>
      </TableCell>
    </TableRow>
  )
})
ProductRow.displayName = 'ProductRow'

export function AdminProducts({ products }: AdminProductsProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [syncing, setSyncing] = useState(false)

  const handleSyncSizes = async () => {
    setSyncing(true)
    try {
      const result = await syncProductSizesFromBase()

      if (!result.success) {
        toast.error(result.error ?? 'Could not sync print sizes')
        return
      }

      toast.success(
        `Applied ${result.sizes} print size${result.sizes === 1 ? '' : 's'} to ${result.products} product${result.products === 1 ? '' : 's'}`,
      )
      router.refresh()
    } catch (error) {
      console.error('Failed to sync product sizes:', error)
      toast.error('Could not sync print sizes')
    } finally {
      setSyncing(false)
    }
  }

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesName = product.name.toLowerCase().includes(query)
        const matchesDescription = product.description
          ?.toLowerCase()
          .includes(query)
        if (!matchesName && !matchesDescription) return false
      }

      // Status filter
      if (statusFilter === 'active' && !product.active) return false
      if (statusFilter === 'inactive' && product.active) return false

      return true
    })
  }, [products, searchQuery, statusFilter])

  // Paginate products
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredProducts, currentPage, itemsPerPage])

  // Calculate pagination info
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage)

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
        <CardTitle>Products</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleSyncSizes}
            disabled={syncing || products.length === 0}
          >
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {syncing ? 'Syncing…' : 'Sync print sizes'}
          </Button>
          <Button asChild>
            <Link href="/admin/store/new">Add Product</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-gray-600">
            {filteredProducts.length} product
            {filteredProducts.length !== 1 ? 's' : ''}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProducts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-gray-500"
                >
                  {searchQuery || statusFilter !== 'all'
                    ? 'No products match your filters'
                    : 'No products found'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedProducts.map((product) => (
                <ProductRow key={product.id} product={product} />
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {filteredProducts.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredProducts.length}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
            className="border-t pt-4"
          />
        )}
      </CardContent>
    </Card>
  )
}
