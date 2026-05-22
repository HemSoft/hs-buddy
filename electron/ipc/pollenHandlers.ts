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

type PollenDay = {
  pollenTypeInfo?: GooglePollenTypeInfo[]
  plantInfo?: GooglePlantInfo[]
}

const POLLEN_TYPE_TO_KEY: Record<string, PollenTypeKey> = {
  TREE: 'tree',
  GRASS: 'grass',
  WEED: 'weed',
}

function getPollenTypeKey(code?: string): PollenTypeKey | null {
  if (!code) return null
  return POLLEN_TYPE_TO_KEY[code] ?? null
}

function getPollenIndexValue(indexInfo?: GoogleIndexInfo): number {
  return indexInfo?.value ?? 0
}

function getPollenCategory(indexInfo?: GoogleIndexInfo): string {
  return indexInfo?.category ?? 'None'
}

function getSeasonStatus(inSeason?: boolean): boolean {
  return inSeason ?? false
}

function appendHealthRecommendations(result: PollenData, healthRecommendations?: string[]): void {
  if (!healthRecommendations) return
  result.healthRecommendations.push(...healthRecommendations)
}

function parsePollenTypes(types: GooglePollenTypeInfo[], result: PollenData): void {
  for (const t of types) {
    const key = getPollenTypeKey(t.code)
    if (key) result[key] = getPollenIndexValue(t.indexInfo)
    appendHealthRecommendations(result, t.healthRecommendations)
  }
}

const VALID_POLLEN_TYPES = new Set(['TREE', 'GRASS', 'WEED'])

function normalizePollenType(raw: string | undefined): 'TREE' | 'GRASS' | 'WEED' {
  const upper = (raw ?? '').toUpperCase()
  return VALID_POLLEN_TYPES.has(upper) ? (upper as 'TREE' | 'GRASS' | 'WEED') : 'TREE'
}

function getPlantType(plant: GooglePlantInfo): 'TREE' | 'GRASS' | 'WEED' {
  return normalizePollenType(plant.plantDescription?.type)
}

function extractSpeciesFields(plant: GooglePlantInfo): Omit<PollenSpecies, 'code' | 'displayName'> {
  return {
    index: getPollenIndexValue(plant.indexInfo),
    category: getPollenCategory(plant.indexInfo),
    inSeason: getSeasonStatus(plant.inSeason),
    type: getPlantType(plant),
  }
}

function parsePlantInfo(plant: GooglePlantInfo): PollenSpecies | null {
  if (!plant.code || !plant.displayName) return null
  return {
    code: plant.code,
    displayName: plant.displayName,
    ...extractSpeciesFields(plant),
  }
}

function hasItems(items?: unknown[]): boolean {
  return Array.isArray(items) && items.length > 0
}

function hasDayData(day: PollenDay): boolean {
  return hasItems(day.pollenTypeInfo) || hasItems(day.plantInfo)
}

function parseSpeciesList(
  plantInfo: GoogleForecastResponse['dailyInfo'][0]['plantInfo']
): PollenSpecies[] {
  const species: PollenSpecies[] = []
  for (const p of plantInfo ?? []) {
    const s = parsePlantInfo(p)
    if (s) species.push(s)
  }
  return species
}

function parseGooglePollenResponse(json: GoogleForecastResponse): PollenData | null {
  const day = json.dailyInfo?.[0]
  if (!day || !hasDayData(day)) return null

  const result: PollenData = { tree: 0, grass: 0, weed: 0, species: [], healthRecommendations: [] }
  parsePollenTypes(day.pollenTypeInfo ?? [], result)
  result.species = parseSpeciesList(day.plantInfo)

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

function isValidLocation(location: { latitude: number; longitude: number }): boolean {
  return !!location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
}

function buildPollenFetchSuccess(data: PollenData | null): PollenFetchResult {
  if (!data) {
    return { success: false, error: 'No pollen data available for this location' }
  }
  return { success: true, data }
}

async function fetchPollenData(location: {
  latitude: number
  longitude: number
}): Promise<PollenFetchResult> {
  const apiKey = configManager.getUiValue('pollenApiKey') as string
  if (!apiKey) return { success: false, error: 'no-api-key' }
  if (!isValidLocation(location)) return { success: false, error: 'Invalid location' }

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
    return buildPollenFetchSuccess(parseGooglePollenResponse(json))
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
