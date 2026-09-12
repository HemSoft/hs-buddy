import { access, chmod, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'

/** Preserve node-pty's executable helper after asar unpacking. */
export default async function afterPack(context) {
  if (context.electronPlatformName === 'win32') return

  const resourcesDirectory =
    context.electronPlatformName === 'darwin'
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources'
        )
      : join(context.appOutDir, 'resources')
  const nodePtyDirectory = join(resourcesDirectory, 'app.asar.unpacked', 'node_modules', 'node-pty')
  const files = await readdir(nodePtyDirectory, { recursive: true })
  const helpers = files.filter(file => file.replaceAll('\\', '/').endsWith('/spawn-helper'))
  if (helpers.length === 0) {
    throw new Error(
      `node-pty spawn-helper was not found after packing ${context.electronPlatformName} output ${context.appOutDir}; expected node_modules/node-pty/**/spawn-helper`
    )
  }
  await Promise.all(
    helpers.map(async file => {
      const helper = join(nodePtyDirectory, file)
      await chmod(helper, 0o755)
      await access(helper, constants.X_OK)
    })
  )
}
