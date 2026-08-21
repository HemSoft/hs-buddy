import { BrowserWindow, type WebContents } from 'electron'

export type WindowProvider = () => BrowserWindow | null

export function getSenderWindow(sender: WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender)
}

export function requireSenderWindow(sender: WebContents): BrowserWindow {
  const window = getSenderWindow(sender)
  if (!window) throw new Error('IPC sender is not attached to a BrowserWindow')
  return window
}
