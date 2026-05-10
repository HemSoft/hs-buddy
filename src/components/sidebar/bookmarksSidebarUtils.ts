import { isInternalHostname } from '../../utils/networkSecurity'

export function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return !isInternalHostname(parsed.hostname.toLowerCase())
  } catch (_: unknown) {
    return false
  }
}

export interface CategoryNode {
  name: string
  fullPath: string
  directCount: number
  totalCount: number
  children: CategoryNode[]
}

function appendPathSegment(current: string, segment: string): string {
  return current ? `${current}/${segment}` : segment
}

function ensurePathExists(
  parts: string[],
  nodeMap: Map<string, CategoryNode>,
  root: CategoryNode[]
): void {
  let currentPath = ''
  for (let i = 0; i < parts.length; i++) {
    const parentPath = currentPath
    currentPath = appendPathSegment(currentPath, parts[i])

    if (nodeMap.has(currentPath)) continue

    const node: CategoryNode = {
      name: parts[i],
      fullPath: currentPath,
      directCount: 0,
      totalCount: 0,
      children: [],
    }
    nodeMap.set(currentPath, node)

    if (!parentPath) {
      root.push(node)
    } else {
      nodeMap.get(parentPath)!.children.push(node)
    }
  }
}

function rollUpCounts(
  sorted: string[],
  counts: Record<string, number>,
  nodeMap: Map<string, CategoryNode>
): void {
  for (const cat of sorted) {
    const directCount = counts[cat] ?? 0
    const node = nodeMap.get(cat)
    if (node) {
      node.directCount = directCount
    }
    const parts = cat.split('/')
    let path = ''
    for (const part of parts) {
      path = appendPathSegment(path, part)
      nodeMap.get(path)!.totalCount += directCount
    }
  }
}

export function buildCategoryTree(
  categories: string[],
  counts: Record<string, number>
): CategoryNode[] {
  const root: CategoryNode[] = []
  const nodeMap = new Map<string, CategoryNode>()

  const sorted = [...categories].sort()

  for (const cat of sorted) {
    ensurePathExists(cat.split('/'), nodeMap, root)
  }

  rollUpCounts(sorted, counts, nodeMap)

  return root
}
