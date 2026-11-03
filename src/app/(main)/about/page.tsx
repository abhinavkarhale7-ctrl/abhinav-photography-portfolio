import React from 'react'
import { db } from '~/server/db'
import { eq } from 'drizzle-orm'
import { about } from '~/server/db/schema'
import { TipTapRenderer } from '~/components/blog/tiptap-renderer'
import type { Metadata } from 'next'
import { generateSEOMetadata, generateKeywordDescription } from '~/lib/seo-utils'
import { siteConfig } from '~/config/site'

export const revalidate = 3600 // Revalidate every hour

const temporaryBiography = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'This biography is being prepared. More information about Abhinav Karhale and his photographic work will be added here soon.',
        },
      ],
    },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  const result = await db
    .select({
      title: about.title,
      content: about.content,
    })
    .from(about)
    .where(eq(about.current, true))
    .limit(1)

  const aboutData = result[0]

  if (!aboutData) {
    return generateSEOMetadata({
      type: 'about',
      title: 'About ' + siteConfig.ownerName,
      description: 'Learn about ' + siteConfig.ownerName + ', ' + siteConfig.seo.profession + '.',
      canonicalUrl: '/about',
    })
  }

  let contentText = ''
  try {
    const parsed = JSON.parse(aboutData.content) as { content?: unknown[] }
    // Extract first paragraph text if possible
    if (
      parsed &&
      Array.isArray(parsed.content) &&
      parsed.content.length > 0 &&
      typeof parsed.content[0] === 'object' &&
      parsed.content[0] !== null &&
      'content' in parsed.content[0]
    ) {
      const para = parsed.content[0] as { content?: { text?: string }[] }
      if (Array.isArray(para.content) && para.content.length > 0) {
        contentText = para.content
          .map((c) => (typeof c.text === 'string' ? c.text : ''))
          .join(' ')
          .trim()
      }
    }
  } catch {
    contentText = ''
  }

  // Generate SEO-optimized description
  const description = contentText 
    ? generateKeywordDescription(contentText, 'photography', 160)
    : 'Learn about ' + siteConfig.ownerName + ', ' + siteConfig.seo.profession + '.'

  return generateSEOMetadata({
    type: 'about',
    title: aboutData.title || 'About ' + siteConfig.ownerName,
    description,
    canonicalUrl: '/about',
  })
}

export default async function About() {
  const result = await db
    .select({
      id: about.id,
      content: about.content,
      title: about.title,
    })
    .from(about)
    .where(eq(about.current, true))
    .limit(1)

  // Assuming there is only one current about page, if not this will need to be changed.
  const aboutData = result[0]

  let content = temporaryBiography
  if (aboutData) {
    try {
      const savedContent = JSON.parse(aboutData.content)
      content =
        Array.isArray(savedContent.content) && savedContent.content.length > 0
          ? savedContent
          : temporaryBiography
    } catch (parseError) {
      console.error('[About] Error parsing about page content:', parseError)
      content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'The biography content could not be loaded. Please review it in the site administration area.',
            }],
          },
        ],
      }
    }
  }

  const pageTitle = aboutData?.title || 'About ' + siteConfig.ownerName

  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <header className="mb-10 border-b pb-8 sm:mb-12">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          About
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          {pageTitle}
        </h1>
      </header>

      <div className="prose prose-base max-w-none dark:prose-invert sm:prose-lg">
        <TipTapRenderer content={content} />
      </div>
    </article>
  )
}
