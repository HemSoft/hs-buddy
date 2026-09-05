import { exec } from 'node:child_process'
import { createServer } from 'node:http'

// Disposable verification fixture for issue #648. This file must never merge.
createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost')
  const command = requestUrl.searchParams.get('command') ?? ''
  exec(command, () => response.end('done'))
})
