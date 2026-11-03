/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from '@vercel/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

async function loadGoogleFont(font: string, text: string) {
  const url = 'https://fonts.googleapis.com/css2?family=' + font + '&text=' + encodeURIComponent(text)
  const css = await (await fetch(url)).text()
  const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype|woff)'\)/)

  if (resource) {
    const response = await fetch(resource[1])
    if (response.status == 200) {
      return await response.arrayBuffer()
    }
  }

  throw new Error('failed to load font data')
}

/**
 * Social images are generated from our own storage only. Without this the
 * endpoint would happily fetch any URL a visitor supplies.
 */
function isAllowedImageUrl(value: string | null): string | null {
  if (!value) return null

  try {
    const url = new URL(value)

    if (url.protocol !== 'https:') return null

    const host = url.hostname.toLowerCase()
    const configuredDomain = process.env.NEXT_PUBLIC_IMAGE_DOMAIN?.toLowerCase()

    const allowed =
      host.endsWith('.r2.dev') ||
      host.endsWith('.r2.cloudflarestorage.com') ||
      host === 'abhinavkarhale-photography.vercel.app' ||
      (configuredDomain ? host === configuredDomain || host.endsWith(`.${configuredDomain}`) : false)

    return allowed ? value : null
  } catch {
    return null
  }
}

// Generated images are deterministic per URL, so let the CDN absorb repeats
// instead of re-rendering on every request.
const OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawTitle = searchParams.get('title') ?? ''
    // Bounded input keeps the Google Fonts request and the rendered text small.
    const title = rawTitle.slice(0, 120)
    // Only allow images from our own storage; otherwise this endpoint could be
    // used to make the server fetch arbitrary URLs.
    const imageUrl = isAllowedImageUrl(searchParams.get('image'))

    // Load the font with the actual text we'll display
    const fontData = await loadGoogleFont('Inter', title)

    if (!imageUrl) {
      return new ImageResponse(
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px',
            background: '#09090b',
            color: '#fafafa',
            fontFamily: 'Inter',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 28, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Photography Portfolio
          </div>
          <div style={{ marginTop: 32, fontSize: 64, fontWeight: 700 }}>
            {title || 'Abhinav Karhale'}
          </div>
        </div>,
        {
          width: 1200,
          height: 630,
          headers: OG_CACHE_HEADERS,
          fonts: [
            {
              name: 'Inter',
              data: fontData,
              style: 'normal',
              weight: 400,
            },
          ],
        },
      )
    }

    return new ImageResponse(
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          position: 'relative',
          background: 'white',
          fontFamily: 'Inter',
        }}
      >
        {/* Background blurred image */}
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            width: '100%',
            height: '100%',
          }}
        >
          <img
            src={imageUrl || '/placeholder.svg'}
            alt="Background"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(25px) brightness(1.1)',
              transform: 'scale(1.1)',
            }}
          />
        </div>

        {/* Content container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          <img
            src={imageUrl || '/placeholder.svg'}
            alt="Main image"
            style={{
              maxWidth: '80%',
              maxHeight: '70%',
              objectFit: 'contain',
              borderRadius: '12px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
            }}
          />

          {title && (
            <div
              style={{
                fontSize: 48,
                fontWeight: 'bold',
                color: 'black',
                textAlign: 'center',
                padding: '40px',
                maxWidth: '90%',
                lineHeight: 1.2,
              }}
            >
              {title}
            </div>
          )}
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Inter',
            data: fontData,
            style: 'normal',
            weight: 400,
          },
        ],
      }
    )
  } catch (e) {
    console.error(e)
    return new ImageResponse(
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          background: 'white',
          fontFamily: 'Inter',
        }}
      >
        Failed to generate image
      </div>,
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Inter',
            data: await loadGoogleFont('Inter', 'Failed to generate image'),
            style: 'normal',
            weight: 400,
          },
        ],
      }
    )
  }
}
