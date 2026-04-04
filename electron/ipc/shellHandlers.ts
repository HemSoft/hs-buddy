import { BrowserWindow, ipcMain, shell, net } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execAsync, getErrorMessage } from '../utils'
import { recordWindowOpen } from '../telemetry'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
        icon: path.join(__dirname, '..', '..', 'public', 'icon.ico'),
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
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: 'Only http/https URLs supported' }
      }

      // Block internal/private IPs to prevent SSRF
      const hostname = parsed.hostname.toLowerCase()
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.startsWith('169.254.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal')
      ) {
        return { success: false, error: 'Internal URLs not allowed' }
      }

      const response = await net.fetch(url, {
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
        headers: { Accept: 'text/html', 'User-Agent': 'hs-buddy/1.0' },
      })
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` }
      }

      // Only parse HTML responses
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/html')) {
        return { success: false, error: 'Not an HTML page' }
      }

      // Read up to 64 KB — titles are always in <head>
      const reader = response.body?.getReader()
      if (!reader) return { success: false, error: 'No body' }
      const chunks: Uint8Array[] = []
      let totalBytes = 0
      const MAX_BYTES = 64 * 1024
      while (totalBytes < MAX_BYTES) {
        const { done, value } = await reader.read()
        if (done || !value) break
        chunks.push(value)
        totalBytes += value.length
      }
      reader.cancel()
      const text = Buffer.concat(chunks).toString('utf-8')

      const decodeEntities = (s: string): string =>
        s
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
          .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&nbsp;/g, ' ')

      // Try <title> tag (supports multiline)
      const titleMatch = text.match(/<title[^>]*>([\s\S]+?)<\/title>/i)
      const rawTitle = titleMatch?.[1]?.trim()?.replace(/\s+/g, ' ')
      if (rawTitle) {
        return { success: true, title: decodeEntities(rawTitle) }
      }
      // Fallback: og:title
      const ogMatch =
        text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
        text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
      if (ogMatch?.[1]) {
        return { success: true, title: decodeEntities(ogMatch[1].trim()) }
      }
      return { success: false, error: 'No title found' }
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // System Fonts
  ipcMain.handle('system:get-fonts', async () => {
    try {
      // Use PowerShell to get installed fonts on Windows
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName(\'System.Drawing\') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"',
        { encoding: 'utf8', timeout: 10000 }
      )
      const fonts = stdout
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0)
        .sort()
      return fonts
    } catch (error) {
      console.error('Failed to get system fonts:', error)
      // Return a reasonable fallback list of common fonts
      return [
        'Arial',
        'Calibri',
        'Cambria',
        'Cascadia Code',
        'Cascadia Mono',
        'Comic Sans MS',
        'Consolas',
        'Courier New',
        'Georgia',
        'Impact',
        'Inter',
        'Lucida Console',
        'Lucida Sans Unicode',
        'Microsoft Sans Serif',
        'Palatino Linotype',
        'Segoe UI',
        'Tahoma',
        'Times New Roman',
        'Trebuchet MS',
        'Verdana',
      ]
    }
  })
}
