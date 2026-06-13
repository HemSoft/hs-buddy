import type {
  CopilotEnterpriseUser,
  CopilotEnterpriseUsersSnapshot,
} from '../types/copilotEnterpriseUsers'

interface FileMetadata {
  sourceFile: string
  fileLastWriteTime: string
}

interface UsageTotals {
  grossQuantity: number
  grossAmount: number
  netAmount: number
  models: Map<string, number>
}

export function parseCopilotEnterpriseUsersContent(content: string): unknown {
  return JSON.parse(content.replace(/^\uFEFF/, ''))
}

const EMPTY_TOTALS: UsageTotals = {
  grossQuantity: 0,
  grossAmount: 0,
  netAmount: 0,
  models: new Map<string, number>(),
}

function createEmptyTotals(): UsageTotals {
  return { ...EMPTY_TOTALS, models: new Map<string, number>() }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
  }
  return null
}

function readArray(record: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function mergeTotals(target: UsageTotals, source: UsageTotals): void {
  target.grossQuantity += source.grossQuantity
  target.grossAmount += source.grossAmount
  target.netAmount += source.netAmount
  for (const [model, quantity] of source.models) {
    target.models.set(model, (target.models.get(model) ?? 0) + quantity)
  }
}

function collectUsageItemsFromValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => collectUsageItemsFromValue(item))
  if (!isRecord(value)) return []

  const directItems = readArray(value, 'usageItems', 'UsageItems', 'items', 'Items')
  if (directItems.length > 0) return directItems

  const nestedValues = [
    'Responses',
    'responses',
    'Response',
    'response',
    'data',
    'Data',
    'Raw',
    'raw',
  ]
    .map(key => value[key])
    .filter(item => item !== undefined)

  return nestedValues.flatMap(item => collectUsageItemsFromValue(item))
}

function totalsFromUsageItems(items: unknown[]): UsageTotals {
  const totals = createEmptyTotals()

  for (const item of items) {
    if (isRecord(item)) addUsageItemTotals(totals, item)
  }

  return totals
}

function addUsageItemTotals(totals: UsageTotals, item: Record<string, unknown>): void {
  const grossQuantity = readNumber(item, 'grossQuantity', 'GrossQuantity', 'gross_quantity') ?? 0
  totals.grossQuantity += grossQuantity
  totals.grossAmount += readNumber(item, 'grossAmount', 'GrossAmount', 'gross_amount') ?? 0
  totals.netAmount += readNumber(item, 'netAmount', 'NetAmount', 'net_amount') ?? 0
  addModelQuantity(totals.models, readString(item, 'model', 'Model'), grossQuantity)
}

function addModelQuantity(
  models: Map<string, number>,
  model: string | null,
  quantity: number
): void {
  if (!model || quantity <= 0) return

  models.set(model, (models.get(model) ?? 0) + quantity)
}

function directTotalsFromRecord(record: Record<string, unknown>): UsageTotals | null {
  const grossQuantity = readNumber(record, 'grossQuantity', 'GrossQuantity', 'gross_quantity')
  if (grossQuantity === null) return null

  const totals = createEmptyTotals()
  totals.grossQuantity = grossQuantity
  totals.grossAmount = readNumber(record, 'grossAmount', 'GrossAmount', 'gross_amount') ?? 0
  totals.netAmount = readNumber(record, 'netAmount', 'NetAmount', 'net_amount') ?? 0
  addDirectTopModel(record, totals.models, grossQuantity)

  return totals
}

function addDirectTopModel(
  record: Record<string, unknown>,
  models: Map<string, number>,
  grossQuantity: number
): void {
  const topModel = readString(record, 'topModel', 'TopModel', 'top_model')
  const topModelQuantity =
    readNumber(record, 'topModelQuantity', 'TopModelQuantity', 'top_model_quantity') ??
    grossQuantity
  addModelQuantity(models, topModel, topModelQuantity)
}

function resolveTopModel(models: Map<string, number>): {
  topModel: string | null
  topModelQuantity: number
} {
  let topModel: string | null = null
  let topModelQuantity = 0

  for (const [model, quantity] of models) {
    if (quantity > topModelQuantity) {
      topModel = model
      topModelQuantity = quantity
    }
  }

  return { topModel, topModelQuantity }
}

function normalizeUserRecord(record: Record<string, unknown>): CopilotEnterpriseUser | null {
  const login = readString(record, 'User', 'user', 'login', 'Login', 'memberLogin', 'member_login')
  if (!login) return null

  const totals = createEmptyTotals()
  const directTotals = directTotalsFromRecord(record)
  if (directTotals) {
    mergeTotals(totals, directTotals)
  } else {
    mergeTotals(totals, totalsFromUsageItems(collectUsageItemsFromValue(record)))
  }

  const { topModel, topModelQuantity } = resolveTopModel(totals.models)
  const success = readBoolean(record, 'Success', 'success') ?? true
  const errorMessage = readString(record, 'Error', 'error', 'errorMessage', 'error_message')

  return {
    login,
    grossQuantity: totals.grossQuantity,
    grossAmount: totals.grossAmount,
    netAmount: totals.netAmount,
    modelCount: totals.models.size,
    topModel,
    topModelQuantity,
    success,
    errorMessage,
    sourceJson: JSON.stringify(record, null, 2),
  }
}

function readUsers(root: Record<string, unknown>): CopilotEnterpriseUser[] {
  const records = readArray(root, 'Users', 'users', 'members', 'Members')
  return records
    .map(record => (isRecord(record) ? normalizeUserRecord(record) : null))
    .filter((user): user is CopilotEnterpriseUser => user !== null)
    .sort((a, b) => b.grossQuantity - a.grossQuantity || a.login.localeCompare(b.login))
}

function readDays(root: Record<string, unknown>): number[] {
  return readArray(root, 'Days', 'days')
    .map(day => (typeof day === 'number' && Number.isFinite(day) ? day : null))
    .filter((day): day is number => day !== null)
}

export function normalizeCopilotEnterpriseUsersSnapshot(
  raw: unknown,
  metadata: FileMetadata
): CopilotEnterpriseUsersSnapshot {
  if (!isRecord(raw)) {
    throw new Error('Copilot metrics file must contain a JSON object')
  }

  const users = readUsers(raw)
  const generatedAt =
    readString(raw, 'GeneratedAtUtc', 'generatedAtUtc', 'generatedAt', 'updatedAt', 'updated_at') ??
    metadata.fileLastWriteTime

  return {
    generatedAt,
    fileLastWriteTime: metadata.fileLastWriteTime,
    sourceFile: metadata.sourceFile,
    enterprise: readString(raw, 'Enterprise', 'enterprise') ?? '',
    organization: readString(raw, 'Organization', 'organization', 'org') ?? '',
    year: readNumber(raw, 'Year', 'year'),
    month: readNumber(raw, 'Month', 'month'),
    days: readDays(raw),
    totalUsers: users.length,
    activeUsers: users.filter(user => user.grossQuantity > 0).length,
    users,
  }
}
