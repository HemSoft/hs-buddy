import { useState, useEffect, useCallback } from 'react'
import type {
  RalphModelsConfig,
  RalphAgentsConfig,
  RalphProvidersConfig,
  RalphConfigType,
} from '../types/ralph'

type ConfigState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

function useRalphConfigInternal<T>(configType: RalphConfigType): ConfigState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.ralph.getConfig(configType)
      setData(result as T)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load config')
    }
    setLoading(false)
  }, [configType])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, refresh: load }
}

export function useRalphModels(): ConfigState<RalphModelsConfig> {
  return useRalphConfigInternal<RalphModelsConfig>('models')
}

export function useRalphAgents(): ConfigState<RalphAgentsConfig> {
  return useRalphConfigInternal<RalphAgentsConfig>('agents')
}

export function useRalphProviders(): ConfigState<RalphProvidersConfig> {
  return useRalphConfigInternal<RalphProvidersConfig>('providers')
}
