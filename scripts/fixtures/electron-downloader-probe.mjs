import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import process from 'node:process'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const mode = process.argv[2] ?? 'uppercase'
const cache = await mkdtemp(join(tmpdir(), 'buddy-downloader-'))
const sockets = new Set()
let tunnels = 0
let requests = 0
const payload = Buffer.from('verified proxied Electron artifact')
const origin = createServer((request, response) => {
  requests++
  assert.equal(request.headers['x-buddy-test'], 'preserved')
  if (request.url === '/stall') return
  response.writeHead(200, { 'content-length': payload.length })
  response.end(payload)
})
const proxy = createServer()
proxy.on('connect', (request, socket, head) => {
  assert.equal(request.url, 'buddy.invalid:80')
  tunnels++
  const upstream = connect(origin.address().port, '127.0.0.1', () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  sockets.add(upstream)
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})
for (const server of [origin, proxy]) {
  server.on('connection', socket => sockets.add(socket))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
}
try {
  // Windows environment keys are case-insensitive; delete aliases before assigning.
  delete process.env.http_proxy
  delete process.env.https_proxy
  delete process.env.HTTP_PROXY
  delete process.env.HTTPS_PROXY
  process.env[mode === 'lowercase' ? 'http_proxy' : 'HTTP_PROXY'] =
    `http://127.0.0.1:${proxy.address().port}`
  process.env[mode === 'lowercase' ? 'https_proxy' : 'HTTPS_PROXY'] =
    `http://127.0.0.1:${proxy.address().port}`
  process.env.NO_PROXY = mode === 'no-proxy' ? '127.0.0.1' : ''
  process.env.no_proxy = process.env.NO_PROXY
  const baseURL =
    mode === 'no-proxy' ? `http://127.0.0.1:${origin.address().port}` : 'http://buddy.invalid'
  const requireBuilder = createRequire(import.meta.resolve('electron-builder'))
  const { downloadElectronArtifactZip } = requireBuilder('app-builder-lib/out/util/electronGet.js')
  const version = `99.0.${process.pid}`
  const options = path => ({
    version,
    arch: 'x64',
    platformName: 'linux',
    artifactName: 'electron',
    cacheDir: join(cache, path.slice(1)),
    electronDownload: {
      unsafelyDisableChecksums: true,
      mirrorOptions: { resolveAssetURL: () => `${baseURL}${path}` },
      downloadOptions: {
        quiet: true,
        headers: { 'x-buddy-test': 'preserved' },
        timeout: { request: 500 },
      },
    },
  })
  const downloaded = await downloadElectronArtifactZip(options('/artifact'))
  assert.deepEqual(await readFile(downloaded), payload)
  assert.equal(requests, 1)
  assert.equal(tunnels > 0, mode !== 'no-proxy', 'Proxy routing must respect NO_PROXY')
  await assert.rejects(downloadElectronArtifactZip(options('/stall')), { name: 'TimeoutError' })
  assert.equal(requests, 2, 'A timed-out download must not be retried')
  const invalid = options('/invalid-agent')
  invalid.electronDownload.downloadOptions.agent = {}
  await assert.rejects(
    downloadElectronArtifactZip(invalid),
    /Fetch dispatcher instead of a Got agent/
  )
  const invalidTLS = options('/invalid-tls')
  invalidTLS.electronDownload = { strictSSL: false }
  await assert.rejects(downloadElectronArtifactZip(invalidTLS), /Got agent or https options/)
  const cancelled = options('/cancelled')
  cancelled.electronDownload.downloadOptions.signal = globalThis.AbortSignal.abort()
  await assert.rejects(downloadElectronArtifactZip(cancelled), { name: 'AbortError' })
  assert.equal(requests, 2, 'An already-aborted caller signal must not issue a request')
  console.log('BUDDY_DOWNLOADER_PROBE_PASS')
} catch (error) {
  console.error(error.cause)
  throw error
} finally {
  for (const socket of sockets) socket.destroy()
  await Promise.all([origin, proxy].map(server => new Promise(resolve => server.close(resolve))))
  await rm(cache, { recursive: true, force: true })
}
