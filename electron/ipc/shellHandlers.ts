import { BrowserWindow, ipcMain, shell, net } from 'electron'
import path from 'node:path'
import { lookup } from 'node:dns/promises'
import { fileURLToPath } from 'node:url'
import { getErrorMessage } from '../../src/utils/errorUtils'
import { recordWindowOpen } from '../telemetry'
import { execAsync } from '../utils'
import { isPrivateIP, extractPageTitle, validateUrl } from '../../src/utils/networkSecurity'
import { IPC_INVOKE } from '../../src/ipc/contracts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Check DNS results for private IP addresses. Throws if any found. */
function assertNoPrivateIPs(results: Array<{ address: string }>): void {
  for (const { address } of results) {
    if (isPrivateIP(address)) throw new Error('Internal URLs not allowed')
  }
}

async function validateUrlWithDns(url: string): Promise<URL> {
  const parsed = validateUrl(url)
  const hostname = parsed.hostname.toLowerCase()

  try {
    const result = await lookup(hostname, { all: true, verbatim: true })
    assertNoPrivateIPs(result)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Internal URLs not allowed') throw err
    throw new Error(`DNS resolution failed for ${hostname}`, { cause: err })
  }

  return parsed
}

const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function assertHtmlContentType(response: Response): void {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) throw new Error('Not an HTML page')
}

async function readResponseBody(response: Response): Promise<string> {
  assertHtmlContentType(response)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No body')
  try {
    return await readChunksUpToLimit(reader, 64 * 1024)
  } finally {
    await reader.cancel()
  }
}

async function readChunksUpToLimit(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number
): Promise<string> {
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (totalBytes < maxBytes) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    totalBytes += value.length
  }
  return Buffer.concat(chunks).toString('utf-8')
}

async function fetchPageContent(url: string): Promise<string> {
  let currentUrl = url

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await validateUrlWithDns(currentUrl)

    const response = await net.fetch(currentUrl, {
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
      headers: { Accept: 'text/html', 'User-Agent': 'hs-buddy/1.0' },
    })

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Redirect with no Location header')
      currentUrl = new URL(location, currentUrl).href
      continue
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return readResponseBody(response)
  }

  throw new Error('Too many redirects')
}

function resolveInAppBrowserTitle(title: string | undefined, hostname: string): string {
  return title ?? hostname
}

function resolveInAppBrowserIconPath(): string {
  return path.join(
    __dirname,
    '..',
    '..',
    'public',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  )
}

function throwIfUnexpectedLoadError(loadError: unknown): void {
  const msg = getErrorMessage(loadError)
  if (!msg.includes('ERR_ABORTED')) {
    throw loadError
  }
}

function createInAppBrowserWindow(parsed: URL, title: string | undefined): BrowserWindow {
  const browserWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: resolveInAppBrowserTitle(title, parsed.hostname),
    icon: resolveInAppBrowserIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:browser',
    },
    backgroundColor: '#1e1e1e',
  })

  browserWin.setMenuBarVisibility(false)
  browserWin.webContents.on('page-title-updated', (_e, pageTitle) => {
    browserWin.setTitle(pageTitle)
  })

  return browserWin
}

function attachNavigationGuards(browserWin: BrowserWindow): (targetUrl: string) => void {
  let navigationVersion = 0

  function guardedNavigate(targetUrl: string): void {
    const thisVersion = ++navigationVersion
    validateUrlWithDns(targetUrl)
      .then(() => {
        if (thisVersion === navigationVersion && !browserWin.isDestroyed()) {
          return browserWin.loadURL(targetUrl)
        }
      })
      .catch(() => {})
  }

  browserWin.webContents.on('will-redirect', (event, redirectUrl) => {
    event.preventDefault()
    guardedNavigate(redirectUrl)
  })

  browserWin.webContents.on('will-navigate', (event, navUrl) => {
    event.preventDefault()
    guardedNavigate(navUrl)
  })

  browserWin.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    guardedNavigate(linkUrl)
    return { action: 'deny' }
  })

  return guardedNavigate
}

async function getSystemFonts(): Promise<string[]> {
  let stdout: string
  if (process.platform === 'win32') {
    const result = await execAsync(
      'powershell -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName(\'System.Drawing\') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"',
      { encoding: 'utf8', timeout: 10000 }
    )
    stdout = result.stdout
  } else if (process.platform === 'darwin') {
    const result = await execAsync(
      'system_profiler SPFontsDataType 2>/dev/null | grep "Full Name:" | sed "s/.*Full Name: //" | sort -u',
      { encoding: 'utf8', timeout: 15000 }
    )
    stdout = result.stdout
  } else {
    const result = await execAsync('fc-list --format="%{family[0]}\\n" | sort -u', {
      encoding: 'utf8',
      timeout: 10000,
    })
    stdout = result.stdout
  }
  return stdout
    .split('\n')
    .map(f => f.trim())
    .filter(f => f.length > 0)
    .sort()
}

const FALLBACK_FONTS = [
  'Arial',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Menlo',
  'Monaco',
  'SF Pro',
  'Segoe UI',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
]

export function registerShellHandlers(): void {
  ipcMain.handle(IPC_INVOKE.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    try {
      const parsed = new URL(url)
      const allowedProtocols = ['http:', 'https:', 'mailto:']
      if (!allowedProtocols.includes(parsed.protocol)) {
        return { success: false, error: 'Only http, https, and mailto URLs are allowed' }
      }
      if (parsed.protocol !== 'mailto:') {
        validateUrl(url)
      }
      await shell.openExternal(url)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle(
    IPC_INVOKE.SHELL_OPEN_IN_APP_BROWSER,
    async (_event, url: string, title?: string) => {
      try {
        const parsed = await validateUrlWithDns(url)
        const browserWin = createInAppBrowserWindow(parsed, title)
        attachNavigationGuards(browserWin)

        try {
          await browserWin.loadURL(url)
        } catch (loadError: unknown) {
          throwIfUnexpectedLoadError(loadError)
        }
        recordWindowOpen(parsed.hostname)
        return { success: true }
      } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )

  ipcMain.handle(IPC_INVOKE.SHELL_FETCH_PAGE_TITLE, async (_event, url: string) => {
    try {
      validateUrl(url)
      const html = await fetchPageContent(url)
      const title = extractPageTitle(html)
      if (title) return { success: true, title }
      return { success: false, error: 'No title found' }
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle(IPC_INVOKE.SYSTEM_GET_FONTS, async () => {
    try {
      return await getSystemFonts()
    } catch (error: unknown) {
      console.error('Failed to get system fonts:', error)
      return FALLBACK_FONTS
    }
  })
}
