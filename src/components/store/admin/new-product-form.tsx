'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { createProduct } from '~/lib/actions/store/products'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'

export function NewProductForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)

    try {
      const result = await createProduct({
        name,
        description,
        imageUrl,
        active,
      })

      if (!result.success || !result.productId) {
        toast.error(result.error ?? 'Failed to create product')
        return
      }

      toast.success('Product created')
      router.push(`/admin/store/products/${result.productId}`)
      router.refresh()
    } catch (error) {
      console.error('Failed to create product:', error)
      toast.error('Failed to create product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sunset over the hills"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Fine art print on archival paper"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input
              id="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://pub-....r2.dev/photo.jpg"
              required
            />
            <p className="text-muted-foreground text-xs">
              Use the public URL of an image from your gallery bucket.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="active"
              checked={active}
              onCheckedChange={(checked) => setActive(checked === true)}
            />
            <Label htmlFor="active">Visible in the store</Label>
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create product'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
