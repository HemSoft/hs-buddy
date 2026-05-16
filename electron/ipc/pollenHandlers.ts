import { ipcMain, net, type IpcMainInvokeEvent } from 'electron'
import { getErrorMessageWithFallback } from '../../src/utils/errorUtils'
import { IPC_INVOKE } from '../../src/ipc/contracts'
import { configManager } from '../config'

export interface PollenData {
  tree: number
  grass: number
  weed: number
}

export interface PollenFetchResult {
  success: boolean
  data?: PollenData
  error?: string
}

interface TomorrowTimelinesResponse {
  data?: {
    timelines?: Array<{
      intervals?: Array<{
        values?: {
          treeIndex?: number
          grassIndex?: number
          weedIndex?: number
        }
      }>
    }>
  }
}

function parsePollenResponse(json: TomorrowTimelinesResponse): PollenData | null {
  const values = json.data?.timelines?.[0]?.intervals?.[0]?.values
  if (!values) return null

  const tree = values.treeIndex
  const grass = values.grassIndex
  const weed = values.weedIndex

  if (!Number.isFinite(tree) || !Number.isFinite(grass) || !Number.isFinite(weed)) return null

  return { tree: tree!, grass: grass!, weed: weed! }
}

export function registerPollenHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.POLLEN_FETCH_CURRENT,
    async (
      _event: IpcMainInvokeEvent,
      location: { latitude: number; longitude: number }
    ): Promise<PollenFetchResult> => {
      const apiKey = configManager.getUiValue('pollenApiKey') as string
      if (!apiKey) {
        return { success: false, error: 'no-api-key' }
      }

      if (
        !location ||
        !Number.isFinite(location.latitude) ||
        !Number.isFinite(location.longitude)
      ) {
        return { success: false, error: 'Invalid location' }
      }

      try {
        const url =
          `https://api.tomorrow.io/v4/timelines` +
          `?location=${location.latitude},${location.longitude}` +
          `&fields=treeIndex,grassIndex,weedIndex` +
          `&timesteps=current` +
          `&units=metric` +
          `&apikey=${apiKey}`

        const res = await net.fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { 'User-Agent': 'hs-buddy/1.0' },
        })

        if (!res.ok) {
          return { success: false, error: `Tomorrow.io API error: ${res.status}` }
        }

        const json = (await res.json()) as TomorrowTimelinesResponse
        const data = parsePollenResponse(json)

        if (!data) {
          return { success: false, error: 'No pollen data available for this location' }
        }

        return { success: true, data }
      } catch (err: unknown) {
        return {
          success: false,
          error: getErrorMessageWithFallback(err, 'Pollen fetch failed'),
        }
      }
    }
  )
}
