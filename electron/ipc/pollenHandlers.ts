import { ipcMain, net, type IpcMainInvokeEvent } from 'electron'
import { getErrorMessageWithFallback } from '../../src/utils/errorUtils'
import { IPC_INVOKE } from '../../src/ipc/contracts'
import { configManager } from '../config'

interface PollenSpecies {
  code: string
  displayName: string
  index: number
  category: string
  inSeason: boolean
  type: 'TREE' | 'GRASS' | 'WEED'
}

interface PollenData {
  tree: number
  grass: number
  weed: number
  species: PollenSpecies[]
  healthRecommendations: string[]
}

interface PollenFetchResult {
  success: boolean
  data?: PollenData
  error?: string
}

interface GoogleIndexInfo {
  value?: number
  category?: string
}

interface GooglePollenTypeInfo {
  code?: string
  indexInfo?: GoogleIndexInfo
  healthRecommendations?: string[]
}

interface GooglePlantInfo {
  code?: string
  displayName?: string
  indexInfo?: GoogleIndexInfo
  inSeason?: boolean
  plantDescription?: { type?: string }
}

interface GoogleForecastResponse {
  dailyInfo?: Array<{
    pollenTypeInfo?: GooglePollenTypeInfo[]
    plantInfo?: GooglePlantInfo[]
  }>
}

type PollenTypeKey = 'tree' | 'grass' | 'weed'

function parsePollenTypes(types: GooglePollenTypeInfo[], result: PollenData): void {
  const codeToKey: Record<string, PollenTypeKey> = { TREE: 'tree', GRASS: 'grass', WEED: 'weed' }
  for (const t of types) {
    const key = codeToKey[t.code ?? '']
    if (key) result[key] = t.indexInfo?.value ?? 0
    if (t.healthRecommendations) result.healthRecommendations.push(...t.healthRecommendations)
  }
}

const VALID_POLLEN_TYPES = new Set(['TREE', 'GRASS', 'WEED'])

function normalizePollenType(raw: string | undefined): 'TREE' | 'GRASS' | 'WEED' {
  const upper = (raw ?? '').toUpperCase()
  return VALID_POLLEN_TYPES.has(upper) ? (upper as 'TREE' | 'GRASS' | 'WEED') : 'TREE'
}

function parsePlantInfo(plant: GooglePlantInfo): PollenSpecies | null {
  if (!plant.code || !plant.displayName) return null
  return {
    code: plant.code,
    displayName: plant.displayName,
    index: plant.indexInfo?.value ?? 0,
    category: plant.indexInfo?.category ?? 'None',
    inSeason: plant.inSeason ?? false,
    type: normalizePollenType(plant.plantDescription?.type),
  }
}

function parseGooglePollenResponse(json: GoogleForecastResponse): PollenData | null {
  const day = json.dailyInfo?.[0]
  if (!day) return null

  const types = day.pollenTypeInfo ?? []
  const plants = day.plantInfo ?? []
  if (types.length === 0 && plants.length === 0) return null

  const result: PollenData = { tree: 0, grass: 0, weed: 0, species: [], healthRecommendations: [] }
  parsePollenTypes(types, result)

  for (const p of plants) {
    const species = parsePlantInfo(p)
    if (species) result.species.push(species)
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

async function fetchPollenData(location: {
  latitude: number
  longitude: number
}): Promise<PollenFetchResult> {
  const apiKey = configManager.getUiValue('pollenApiKey') as string
  if (!apiKey) {
    return { success: false, error: 'no-api-key' }
  }

  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
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
