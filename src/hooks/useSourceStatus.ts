import { useState, useEffect, useRef } from 'react'

export interface SourceStatus {
  copilot: {
    available: boolean
    sqliteAvailable: boolean
    filesystemAvailable: boolean
    sessionStateDir: string
  }
  claude: {
    available: boolean
    claudeDir: string
  }
}

interface UseSourceStatusResult {
  sources: SourceStatus | null
  isLoading: boolean
}

// Module-level cache — survives re-mounts, fetched once per page session
let cachedStatus: SourceStatus | null = null
let fetchPromise: Promise<SourceStatus | null> | null = null

async function fetchSourceStatus(): Promise<SourceStatus | null> {
  try {
    const response = await fetch('/api/sessions/status')
    if (response.status === 404) return null
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export function useSourceStatus(): UseSourceStatusResult {
  const [sources, setSources] = useState<SourceStatus | null>(cachedStatus)
  const [isLoading, setIsLoading] = useState(cachedStatus === null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    // Already initialized from cache via useState — skip fetch
    if (cachedStatus !== null) return

    // Deduplicate concurrent calls
    if (!fetchPromise) {
      fetchPromise = fetchSourceStatus()
    }

    fetchPromise.then((result) => {
      cachedStatus = result
      fetchPromise = null
      if (mounted.current) {
        setSources(result)
        setIsLoading(false)
      }
    })

    return () => {
      mounted.current = false
    }
  }, [])

  return { sources, isLoading }
}
