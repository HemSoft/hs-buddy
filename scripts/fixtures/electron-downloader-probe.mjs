import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import process from 'node:process'
import { createServer } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import { connect } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { URL } from 'node:url'

const mode = process.argv[2] ?? 'uppercase'
const secure = mode.startsWith('https-')
const cache = await mkdtemp(join(tmpdir(), 'buddy-downloader-'))
const sockets = new Set()
const observers = new Map()
let tunnels = 0
let requests = 0
let retryRequests = 0
let resetRequests = 0
const payload = Buffer.from('verified proxied Electron artifact')
const handler = (request, response) => {
  requests++
  assert.equal(request.headers['x-buddy-test'], 'preserved')
  if (request.url.startsWith('/stall')) {
    const observer = observers.get(request.url)
    if (observer) {
      response.once('close', observer.onClosed)
      observer.onStarted()
    }
    return
  }
  if (request.url === '/reset' && resetRequests++ === 0) {
    request.socket.destroy()
    return
  }
  if (request.url === '/retry' && retryRequests++ === 0) {
    response.writeHead(503)
    response.end('temporary failure')
    return
  }
  response.writeHead(200, { 'content-length': payload.length })
  response.end(payload)
}
// Public test-only key and certificate. The child trusts this certificate only;
// production TLS verification and system trust stores remain unchanged.
const origin = secure
  ? createSecureServer(
      {
        key: await readFile(new URL('./downloader-test-key.pem', import.meta.url)),
        cert: await readFile(new URL('./downloader-test-cert.pem', import.meta.url)),
      },
      handler
    )
  : createServer(handler)
const proxy = createServer()
proxy.on('connect', (request, socket, head) => {
  assert.equal(request.url, `buddy.invalid:${secure ? 443 : 80}`)
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
function observeStall(path) {
  let onStarted
  let onClosed
  const started = new Promise(resolve => {
    onStarted = resolve
  })
  const closed = new Promise(resolve => {
    onClosed = resolve
  })
  const observer = { started, closed, onStarted, onClosed }
  observers.set(path, observer)
  return observer
}
for (const server of [origin, proxy]) {
  server.on('connection', socket => sockets.add(socket))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
}
try {
  // Windows keys are case-insensitive; delete aliases before assigning.
  for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY'])
    delete process.env[key]
  const proxyVariable = secure ? 'HTTPS_PROXY' : 'HTTP_PROXY'
  process.env[mode.includes('lowercase') ? proxyVariable.toLowerCase() : proxyVariable] =
    `http://127.0.0.1:${proxy.address().port}`
  process.env.NO_PROXY = mode === 'no-proxy' ? '127.0.0.1' : ''
  process.env.no_proxy = process.env.NO_PROXY
  const baseURL =
    mode === 'no-proxy'
      ? `http://127.0.0.1:${origin.address().port}`
      : `${secure ? 'https' : 'http'}://buddy.invalid`
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

  const observer = observeStall('/stall-caller')
  const controller = new globalThis.AbortController()
  const inFlight = options('/stall-caller')
  inFlight.electronDownload.downloadOptions.signal = controller.signal
  inFlight.electronDownload.downloadOptions.timeout.request = 10000
  const cancelledFetch = assert.rejects(downloadElectronArtifactZip(inFlight), {
    name: 'AbortError',
  })
  await observer.started
  controller.abort()
  await cancelledFetch
  await observer.closed
  assert.equal(requests, 3, 'In-flight caller cancellation must not retry')

  const held = observeStall('/stall-lock')
  const holdingOptions = options('/stall-lock')
  holdingOptions.electronDownload.downloadOptions.timeout.request = 1500
  const first = assert.rejects(downloadElectronArtifactZip(holdingOptions), {
    name: 'TimeoutError',
  })
  await held.started
  const second = downloadElectronArtifactZip(options('/after-lock'))
  await first
  assert.deepEqual(
    await readFile(await second),
    payload,
    'A lock waiter keeps its full request deadline'
  )
  assert.equal(requests, 5)

  const retried = await downloadElectronArtifactZip(options('/retry'))
  assert.deepEqual(await readFile(retried), payload)
  assert.equal(retryRequests, 2, 'Fetch HTTP 503 must retry with a fresh deadline')
  assert.equal(requests, 7)

  const reset = await downloadElectronArtifactZip(options('/reset'))
  assert.deepEqual(await readFile(reset), payload)
  assert.equal(resetRequests, 2, 'A dropped connection (Fetch "fetch failed") must retry')
  assert.equal(requests, 9)
  console.log('BUDDY_DOWNLOADER_PROBE_PASS')
} catch (error) {
  console.error(error.cause)
  throw error
} finally {
  for (const socket of sockets) socket.destroy()
  await Promise.all([origin, proxy].map(server => new Promise(resolve => server.close(resolve))))
  await rm(cache, { recursive: true, force: true })
}
