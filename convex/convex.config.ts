import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import aggregate from '@convex-dev/aggregate/convex.config.js'
import migrations from '@convex-dev/migrations/convex.config.js'

const app = defineApp({
  env: {
    CONVEX_AUTHORIZED_IDENTITIES: v.optional(v.string()),
  },
})

app.use(aggregate, { name: 'runCounts' })
app.use(migrations)

export default app
