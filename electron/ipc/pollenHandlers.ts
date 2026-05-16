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

interface GooglePollenTypeInfo {
  code?: string
  indexInfo?: { value?: number }
}

interface GoogleForecastResponse {
  dailyInfo?: Array<{
    pollenTypeInfo?: GooglePollenTypeInfo[]
  }>
}

function parseGooglePollenResponse(json: GoogleForecastResponse): PollenData | null {
  const types = json.dailyInfo?.[0]?.pollenTypeInfo
  if (!types || types.length === 0) return null

  const codeToKey: Record<string, keyof PollenData> = { TREE: 'tree', GRASS: 'grass', WEED: 'weed' }
  const result: PollenData = { tree: 0, grass: 0, weed: 0 }

  for (const t of types) {
    const key = codeToKey[t.code ?? '']
    if (key) result[key] = t.indexInfo?.value ?? 0
  }

  return result
}

async function extractGoogleErrorDetail(res: Response): Promise<string> {
  try {
    const errBody = (await res.json()) as { error?: { message?: string } }
    if (errBody.error?.message) return errBody.error.message
  } catch (_: unknown) {
    /* no parsable body */
  }
  return `HTTP ${res.status}`
}

async function fetchPollenData(
  location: { latitude: number; longitude: number }
): Promise<PollenFetchResult> {
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
      `https://pollen.googleapis.com/v1/forecast:lookup` +
      `?key=${apiKey}` +
      `&location.latitude=${location.latitude}` +
      `&location.longitude=${location.longitude}` +
      `&days=1`

    const res = await net.fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'hs-buddy/1.0' },
    })

    if (!res.ok) {
      const detail = await extractGoogleErrorDetail(res)
      return { success: false, error: `Google Pollen API: ${detail}` }
    }

    const json = (await res.json()) as GoogleForecastResponse
    const data = parseGooglePollenResponse(json)

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

export function registerPollenHandlers(): void {
  ipcMain.handle(
    IPC_INVOKE.POLLEN_FETCH_CURRENT,
    async (
      _event: IpcMainInvokeEvent,
      location: { latitude: number; longitude: number }
    ): Promise<PollenFetchResult> => fetchPollenData(location)
  )
}
