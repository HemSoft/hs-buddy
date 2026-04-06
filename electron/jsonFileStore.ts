import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback
  }

  return JSON.parse(readFileSync(filePath, 'utf-8')) as T
}

export function writeJsonFile(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data))
}

export function updateJsonFile<T>(filePath: string, fallback: T, update: (current: T) => T): void {
  writeJsonFile(filePath, update(readJsonFile(filePath, fallback)))
}
