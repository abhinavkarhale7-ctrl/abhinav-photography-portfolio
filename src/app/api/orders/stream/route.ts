import { db } from '~/server/db'
import { orders } from '~/server/db/schema'
import { desc } from 'drizzle-orm'
import { isStoreEnabledServer } from '~/lib/store-utils'
import { getSession } from '~/lib/auth/auth'

// Mark as non-static
export const dynamic = 'force-dynamic'

// Emit at most this often, and stop before the platform's 300s function limit
// so the stream closes itself instead of being killed (which used to show up as
// a runtime timeout in the logs).
const POLL_INTERVAL_MS = 5000
const MAX_STREAM_MS = 240_000

export async function GET(request: Request) {
  // Return 404 if store is disabled
  if (!isStoreEnabledServer()) {
    return new Response('Not Found', { status: 404 })
  }

  // Return a clean 401 instead of throwing (which surfaced as a 500).
  const session = await getSession()

  if (!session || session.role !== 'admin') {
    return new Response('Unauthorized', { status: 401 })
  }

  let cancelled = false
  request.signal.addEventListener('abort', () => {
    cancelled = true
  })

  const startedAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let lastPayload = ''

      try {
        while (!cancelled && Date.now() - startedAt < MAX_STREAM_MS) {
          const recentOrders = await db
            .select()
            .from(orders)
            .orderBy(desc(orders.createdAt))

          if (cancelled) break

          // Only write when something actually changed; EventSource clients
          // reconnect when we close, so this keeps the stream cheap.
          const payload = JSON.stringify(recentOrders)

          if (payload !== lastPayload) {
            lastPayload = payload
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }
      } catch (error) {
        // A client disconnect or a database hiccup is normal here; logging it
        // as an error just added noise to the runtime logs.
        if (!cancelled) {
          console.warn('Order stream ended early:', error)
        }
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed by the runtime.
        }
      }
    },

    cancel() {
      cancelled = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
