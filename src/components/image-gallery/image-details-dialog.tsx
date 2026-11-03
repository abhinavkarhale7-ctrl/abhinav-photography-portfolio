'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Loader2, Pencil } from 'lucide-react'

import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import type { PortfolioImageData } from '~/lib/types/image'

export interface ImageDetailsValues {
  name: string
  description: string
  tags: string
}

interface ImageDetailsDialogProps {
  image: PortfolioImageData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (id: number, values: ImageDetailsValues) => Promise<boolean>
}

export function ImageDetailsDialog({
  image,
  open,
  onOpenChange,
  onSave,
}: ImageDetailsDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!image || !open) return
    setName(image.name ?? '')
    setDescription(image.description ?? '')
    setTags(image.tags ?? '')
  }, [image, open])

  const tagList = tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!image || saving) return

    const trimmedName = name.trim()
    if (!trimmedName) return

    setSaving(true)
    try {
      const saved = await onSave(image.id, {
        name: trimmedName,
        description: description.trim(),
        tags: tags.trim(),
      })
      if (saved) onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit image details
          </DialogTitle>
          <DialogDescription>
            Update the title, description and tags shown with this image.
          </DialogDescription>
        </DialogHeader>

        {image && (
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
            <Image
              src={image.fileUrl || '/placeholder.svg'}
              alt={image.name || 'Portfolio image'}
              fill
              sizes="(max-width: 640px) 90vw, 32rem"
              className="object-cover"
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image-title">Title</Label>
            <Input
              id="image-title"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Sunrise over the Western Ghats"
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="image-description">Description</Label>
            <Textarea
              id="image-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A short story about this photograph, or details about the print."
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="image-tags">Tags</Label>
            <Input
              id="image-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="landscape, sunrise, mountains"
            />
            <p className="text-muted-foreground text-xs">
              Separate tags with commas.
            </p>
            {tagList.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {tagList.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
