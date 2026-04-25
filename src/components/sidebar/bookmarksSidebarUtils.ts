export function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
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

function ensurePathExists(
  parts: string[],
  nodeMap: Map<string, CategoryNode>,
  root: CategoryNode[]
): void {
  let currentPath = ''
  for (let i = 0; i < parts.length; i++) {
    const parentPath = currentPath
    currentPath = i === 0 ? parts[i] : `${currentPath}/${parts[i]}`

    if (nodeMap.has(currentPath)) continue

    const node: CategoryNode = {
      name: parts[i],
      fullPath: currentPath,
      directCount: 0,
      totalCount: 0,
      children: [],
    }
    nodeMap.set(currentPath, node)

    if (parentPath && nodeMap.has(parentPath)) {
      nodeMap.get(parentPath)!.children.push(node)
      /* v8 ignore start */
    } else if (!parentPath) {
      root.push(node)
    }
    /* v8 ignore stop */
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
    /* v8 ignore start */
    if (node) {
      node.directCount = directCount
    }
    /* v8 ignore stop */
    const parts = cat.split('/')
    let path = ''
    for (let i = 0; i < parts.length; i++) {
      path = i === 0 ? parts[i] : `${path}/${parts[i]}`
      const ancestor = nodeMap.get(path)
      /* v8 ignore start */
      if (ancestor) {
        ancestor.totalCount += directCount
      }
      /* v8 ignore stop */
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
