/**
 * Window geometry helpers — pure functions extracted from electron/main.ts
 * so multi-display resolution logic is testable without Electron APIs.
 */

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayInfo {
  id: number
  bounds: Rectangle
  workArea: Rectangle
}

interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

function clampToWorkArea(
  x: number,
  y: number,
  width: number,
  height: number,
  workArea: Rectangle
): Rectangle {
  const clampedWidth = Math.min(width, workArea.width)
  const clampedHeight = Math.min(height, workArea.height)

  return {
    x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - clampedWidth)),
    y: Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - clampedHeight)),
    width: clampedWidth,
    height: clampedHeight,
  }
}

function centerOnDisplay(width: number, height: number, workArea: Rectangle): Rectangle {
  const clampedWidth = Math.min(width, workArea.width)
  const clampedHeight = Math.min(height, workArea.height)
  return {
    x: workArea.x + Math.round((workArea.width - clampedWidth) / 2),
    y: workArea.y + Math.round((workArea.height - clampedHeight) / 2),
    width: clampedWidth,
    height: clampedHeight,
  }
}

function relocateToSavedDisplay(
  x: number,
  y: number,
  width: number,
  height: number,
  savedWorkArea: Rectangle,
  savedDisplayBounds: Rectangle,
  targetBounds: Rectangle
): Rectangle {
  const oldBounds = savedDisplayBounds.width > 0 ? savedDisplayBounds : targetBounds
  return clampToWorkArea(
    savedWorkArea.x + (x - oldBounds.x),
    savedWorkArea.y + (y - oldBounds.y),
    width,
    height,
    savedWorkArea
  )
}

/**
 * Pure decision tree for resolving window bounds across displays.
 *
 * Replaces the Electron-coupled `resolveWindowBounds()` in main.ts.
 * The caller provides display snapshots; this function returns the
 * corrected bounds with no side-effects.
 */
export function resolveWindowBounds(
  state: WindowBounds,
  screenInfo: {
    savedDisplayId: number
    savedDisplayBounds: Rectangle
    allDisplays: DisplayInfo[]
    primaryWorkArea: Rectangle
    getMatchingDisplay: (bounds: Rectangle) => DisplayInfo
  }
): WindowBounds {
  const { x, y, width, height } = state

  if (x === undefined || y === undefined) return { x, y, width, height }

  const { savedDisplayId, savedDisplayBounds, allDisplays, primaryWorkArea, getMatchingDisplay } =
    screenInfo

  if (savedDisplayId === 0) return { x, y, width, height }

  const savedDisplay = allDisplays.find(d => d.id === savedDisplayId)
  const targetDisplay = getMatchingDisplay({ x, y, width, height })

  if (!savedDisplay) {
    return centerOnDisplay(width, height, primaryWorkArea)
  }

  if (targetDisplay.id !== savedDisplayId) {
    return relocateToSavedDisplay(
      x,
      y,
      width,
      height,
      savedDisplay.workArea,
      savedDisplayBounds,
      targetDisplay.bounds
    )
  }

  return clampToWorkArea(x, y, width, height, savedDisplay.workArea)
}
