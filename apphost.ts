// hs-buddy Aspire AppHost
// Orchestrates the Convex backend and Vite+Electron frontend
// Run with: aspire run (or: bun run aspire)
// Docs: https://aspire.dev

import { createBuilder } from './.modules/aspire.js'

// Aspire SDK transport layer depends on this (loaded by .modules/transport.ts)
import 'vscode-jsonrpc'

const builder = await createBuilder()

// Convex local dev server (backend on port 3210, dashboard on 6790)
const convex = await builder
  .addNodeApp('convex', '.', 'node_modules/.bin/convex')
  .withArgs(['dev'])
  .withHttpEndpoint({ port: 3210, env: 'CONVEX_PORT' })

// Vite dev server + Electron (vite-plugin-electron handles Electron launch)
await builder
  .addViteApp('buddy', '.')
  .withReference(convex)
  .waitFor(convex)
  .withExternalHttpEndpoints()

await builder.build().run()
