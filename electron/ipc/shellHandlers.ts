import { BrowserWindow, ipcMain, shell, net } from 'electron'
import path from 'node:path'
import { lookup } from 'node:dns/promises'
import { fileURLToPath } from 'node:url'
import { getErrorMessage } from '../../src/utils/errorUtils'
import { recordWindowOpen } from '../telemetry'
import { execAsync } from '../utils'
import { isPrivateIP, extractPageTitle, validateUrl } from '../../src/utils/networkSecurity'

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
  } catch (err) {
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

export function registerShellHandlers(): void {
  // Open external links in default browser
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // Open URL in a built-in app browser window
  ipcMain.handle('shell:open-in-app-browser', async (_event, url: string, title?: string) => {
    try {
      // Validate URL
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: 'Only http/https URLs supported' }
      }

      const browserWin = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        title: title ?? parsed.hostname,
        icon: path.join(
          __dirname,
          '..',
          '..',
          'public',
          process.platform === 'win32' ? 'icon.ico' : 'icon.png'
        ),
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          partition: 'persist:browser',
        },
        backgroundColor: '#1e1e1e',
      })

      // Remove the application menu from the browser window
      browserWin.setMenuBarVisibility(false)

      // Update title when page finishes loading
      browserWin.webContents.on('page-title-updated', (_e, pageTitle) => {
        browserWin.setTitle(pageTitle)
      })

      // Open external links (target=_blank) in the same window after validating the URL
      browserWin.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
        try {
          const linkParsed = new URL(linkUrl)
          if (['http:', 'https:'].includes(linkParsed.protocol)) {
            browserWin.loadURL(linkUrl)
          }
        } catch {
          // Invalid URL — ignore
        }
        return { action: 'deny' }
      })

      await browserWin.loadURL(url)
      recordWindowOpen(parsed.hostname)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // Fetch page title from a URL
  ipcMain.handle('shell:fetch-page-title', async (_event, url: string) => {
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

  // System Fonts
  ipcMain.handle('system:get-fonts', async () => {
    try {
      let stdout: string
      if (process.platform === 'win32') {
        // Use PowerShell to get installed fonts on Windows
        const result = await execAsync(
          'powershell -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName(\'System.Drawing\') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"',
          { encoding: 'utf8', timeout: 10000 }
        )
        stdout = result.stdout
      } else if (process.platform === 'darwin') {
        // Use system_profiler on macOS (slower but always available)
        const result = await execAsync(
          'system_profiler SPFontsDataType 2>/dev/null | grep "Full Name:" | sed "s/.*Full Name: //" | sort -u',
          { encoding: 'utf8', timeout: 15000 }
        )
        stdout = result.stdout
      } else {
        // Linux — try fc-list
        const result = await execAsync('fc-list --format="%{family[0]}\\n" | sort -u', {
          encoding: 'utf8',
          timeout: 10000,
        })
        stdout = result.stdout
      }
      const fonts = stdout
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0)
        .sort()
      return fonts
    } catch (error) {
      console.error('Failed to get system fonts:', error)
      // Return a reasonable fallback list of common cross-platform fonts
      return [
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
    }
  })
}
