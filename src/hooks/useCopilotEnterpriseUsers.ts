import { useEffect, useState } from 'react'
import type {
  CopilotEnterpriseUsersResponse,
  CopilotEnterpriseUsersSnapshot,
} from '../types/copilotEnterpriseUsers'
import { getErrorMessage } from '../utils/errorUtils'

interface CopilotEnterpriseUsersState {
  data: CopilotEnterpriseUsersSnapshot | null
  loading: boolean
  error: string | null
}

const EMPTY_STATE: CopilotEnterpriseUsersState = {
  data: null,
  loading: true,
  error: null,
}

async function loadEnterpriseUsers(): Promise<CopilotEnterpriseUsersResponse> {
  const { getCopilotEnterpriseUsers } = window.github as typeof window.github & {
    getCopilotEnterpriseUsers?: () => Promise<CopilotEnterpriseUsersResponse>
  }

  if (!getCopilotEnterpriseUsers) {
    return { success: false, error: 'Copilot Enterprise users source is unavailable.' }
  }

  return getCopilotEnterpriseUsers()
}

export function useCopilotEnterpriseUsers(refreshToken = 0): CopilotEnterpriseUsersState {
  const [state, setState] = useState<CopilotEnterpriseUsersState>(EMPTY_STATE)

  useEffect(() => {
    let canceled = false

    async function load(): Promise<void> {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const result = await loadEnterpriseUsers()
        if (canceled) return

        if (!result.success || !result.data) {
          setState({
            data: null,
            loading: false,
            error: result.error ?? 'Failed to read Copilot Enterprise users.',
          })
          return
        }

        setState({ data: result.data, loading: false, error: null })
      } catch (error: unknown) {
        if (canceled) return
        setState({ data: null, loading: false, error: getErrorMessage(error) })
      }
    }

    void load()

    return () => {
      canceled = true
    }
  }, [refreshToken])

  return state
}
