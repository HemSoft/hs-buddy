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
  const github = window.github as
    | (typeof window.github & {
        getCopilotEnterpriseUsers?: () => Promise<CopilotEnterpriseUsersResponse>
      })
    | undefined
  const getCopilotEnterpriseUsers = github?.getCopilotEnterpriseUsers

  if (!getCopilotEnterpriseUsers) {
    return { success: false, error: 'Copilot Enterprise users source is unavailable.' }
  }

  return getCopilotEnterpriseUsers()
}

function loadingState(previous: CopilotEnterpriseUsersState): CopilotEnterpriseUsersState {
  return { ...previous, loading: true, error: null }
}

function successState(data: CopilotEnterpriseUsersSnapshot): CopilotEnterpriseUsersState {
  return { data, loading: false, error: null }
}

function failureState(error?: string): CopilotEnterpriseUsersState {
  return {
    data: null,
    loading: false,
    error: error ?? 'Failed to read Copilot Enterprise users.',
  }
}

function stateFromEnterpriseUsersResult(
  result: CopilotEnterpriseUsersResponse
): CopilotEnterpriseUsersState {
  if (!result.success) return failureState(result.error)
  if (!result.data) return failureState(result.error)

  return successState(result.data)
}

export function useCopilotEnterpriseUsers(refreshToken = 0): CopilotEnterpriseUsersState {
  const [state, setState] = useState<CopilotEnterpriseUsersState>(EMPTY_STATE)

  useEffect(() => {
    let canceled = false

    async function load(): Promise<void> {
      setState(loadingState)

      try {
        const result = await loadEnterpriseUsers()
        if (canceled) return

        setState(stateFromEnterpriseUsersResult(result))
      } catch (error: unknown) {
        if (canceled) return
        setState(failureState(getErrorMessage(error)))
      }
    }

    void load()

    return () => {
      canceled = true
    }
  }, [refreshToken])

  return state
}
