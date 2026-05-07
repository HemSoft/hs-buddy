/**
 * Module-level map: viewKey → PTY sessionId.
 * Survives React unmount/remount so tab switches don't kill sessions.
 */
const viewSessionMap = new Map<string, string>()
const viewPasteHandlerMap = new Map<string, (text: string) => void>()

export function getSessionId(viewKey: string): string | undefined {
  return viewSessionMap.get(viewKey)
}

export function setSessionId(viewKey: string, sessionId: string): void {
  viewSessionMap.set(viewKey, sessionId)
}

export function removeSession(viewKey: string): void {
  viewSessionMap.delete(viewKey)
}

export function setTerminalPasteHandler(viewKey: string, handler: (text: string) => void): void {
  viewPasteHandlerMap.set(viewKey, handler)
}

export function removeTerminalPasteHandler(viewKey: string): void {
  viewPasteHandlerMap.delete(viewKey)
}

export function hasTerminalPasteHandler(viewKey: string): boolean {
  return viewPasteHandlerMap.has(viewKey)
}

export function pasteIntoTerminal(viewKey: string, text: string): boolean {
  const handler = viewPasteHandlerMap.get(viewKey)
  if (!handler) return false
  handler(text)
  return true
}

export function killTerminalSession(viewKey: string): void {
  const sid = viewSessionMap.get(viewKey)
  if (sid) {
    viewSessionMap.delete(viewKey)
    void window.terminal.kill(sid).catch(error => {
      // Restore mapping so a retry can succeed
      if (!viewSessionMap.has(viewKey)) {
        viewSessionMap.set(viewKey, sid)
      }
      console.error(`Failed to kill terminal session for view "${viewKey}"`, error)
    })
  }
}
