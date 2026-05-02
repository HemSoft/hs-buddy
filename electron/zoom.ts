import { app } from 'electron'
import path from 'node:path'
import { readJsonFile, writeJsonFile } from './jsonFileStore'

const getZoomConfigPath = () => path.join(app.getPath('userData'), 'zoom-level.json')

export function loadZoomLevel(): number {
  try {
    const data = readJsonFile<{ zoomFactor?: number }>(getZoomConfigPath(), {})
    return data.zoomFactor || 1.0
  } catch (err: unknown) {
    console.error('[zoom] Failed to load zoom level:', err)
  }
  return 1.0
}

export function saveZoomLevel(zoomFactor: number): void {
  try {
    writeJsonFile(getZoomConfigPath(), { zoomFactor })
  } catch (err: unknown) {
    console.error('[zoom] Failed to save zoom level:', err)
  }
}
