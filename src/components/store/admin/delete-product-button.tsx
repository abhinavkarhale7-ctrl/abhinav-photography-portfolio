'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { deleteProduct } from '~/lib/actions/store/delete'
import { Button } from '~/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog'

interface DeleteProductButtonProps {
  productId: string
  productName: string
  compact?: boolean
}

export function DeleteProductButton({
  productId,
  productName,
  compact = false,
}: DeleteProductButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)

    try {
      const result = await deleteProduct(productId)

      if (!result.success) {
        toast.error(result.error ?? 'Failed to delete product')
        return
      }

      toast.success(result.message ?? 'Product deleted')
      router.push('/admin/store')
      router.refresh()
    } catch (error) {
      console.error('Failed to delete product:', error)
      toast.error('Failed to delete product')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
            disabled={deleting}
            aria-label={`Delete ${productName}`}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <Button variant="destructive" disabled={deleting}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{productName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the product and its sizes. If it has orders, it will
            be hidden instead of deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>
            Delete product
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
