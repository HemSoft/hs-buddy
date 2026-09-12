import { chmod, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Preserve node-pty's executable helper after asar unpacking. */
export default async function afterPack(context) {
  const files = await readdir(context.appOutDir, { recursive: true })
  const helpers = files.filter(file => {
    const normalized = file.replaceAll('\\', '/')
    return normalized.includes('/node-pty/') && normalized.endsWith('/spawn-helper')
  })
  if (context.electronPlatformName !== 'win32' && helpers.length === 0) {
    throw new Error(
      `node-pty spawn-helper was not packaged for ${context.electronPlatformName} under ${context.appOutDir} (expected node_modules/node-pty/**/spawn-helper)`
    )
  }
  await Promise.all(helpers.map(file => chmod(join(context.appOutDir, file), 0o755)))
}
