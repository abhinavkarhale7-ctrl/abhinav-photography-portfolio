'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

export function useRealTimeUpdates(
  dependencies: unknown[] = [],
  interval: number | null = 10000,
) {
  const router = useRouter()

  const refreshData = useCallback(() => {
    router.refresh()
  }, [router])

  // Serialize the dependency values: a refresh produces new array/object
  // identities with identical content, which previously caused an endless
  // refresh loop. Only refresh when the content actually changes.
  const signature = JSON.stringify(dependencies)
  const lastSignature = useRef(signature)

  useEffect(() => {
    // A null interval keeps the manual refresh helper without polling.
    if (interval === null) return
    const intervalId = setInterval(refreshData, interval)
    return () => clearInterval(intervalId)
  }, [refreshData, interval])

  useEffect(() => {
    if (lastSignature.current === signature) return
    lastSignature.current = signature
    refreshData()
  }, [signature, refreshData])

  return refreshData
}
