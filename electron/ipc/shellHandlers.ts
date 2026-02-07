import { ipcMain, shell } from 'electron'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export function registerShellHandlers(): void {
  // Open external links in default browser
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
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
      const fonts = stdout.split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0)
        .sort()
      return fonts
    } catch (error) {
      console.error('Failed to get system fonts:', error)
      // Return a reasonable fallback list of common fonts
      return [
        'Arial', 'Calibri', 'Cambria', 'Cascadia Code', 'Cascadia Mono',
        'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact',
        'Inter', 'Lucida Console', 'Lucida Sans Unicode', 'Microsoft Sans Serif',
        'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS',
        'Verdana'
      ]
    }
  })
}
