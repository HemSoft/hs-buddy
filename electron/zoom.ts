import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const getZoomConfigPath = () => path.join(app.getPath('userData'), 'zoom-level.json')

export function loadZoomLevel(): number {
  try {
    const configPath = getZoomConfigPath()
    if (existsSync(configPath)) {
      const data = JSON.parse(readFileSync(configPath, 'utf-8'))
      return data.zoomFactor || 1.0
    }
  } catch (err) {
    console.error('[zoom] Failed to load zoom level:', err)
  }
  return 1.0
}

export function saveZoomLevel(zoomFactor: number): void {
  try {
    writeFileSync(getZoomConfigPath(), JSON.stringify({ zoomFactor }))
  } catch (err) {
    console.error('[zoom] Failed to save zoom level:', err)
  }
}
