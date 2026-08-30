import { createServer } from 'node:http'
import path from 'node:path'

import { createServer as createViteServer } from 'vite'

import { loadCuratorConfig } from './curation-config.mjs'
import { buildCuratorItems, curatorDatasetFingerprint } from './curation-data.mjs'
import { createCuratorRequestHandler } from './curation-http.mjs'
import { loadSelection, saveSelection } from './curation-store.mjs'

async function start() {
  const config = loadCuratorConfig()
  const items = await buildCuratorItems(config)
  const fingerprint = curatorDatasetFingerprint(items)
  const selectionPath = path.join(config.stateDir, 'act-h3-selection.json')
  const context = {
    items,
    selection: loadSelection(selectionPath, items, fingerprint),
    selectionPath,
  }
  await saveSelection(selectionPath, context.selection)

  const apiHandler = createCuratorRequestHandler(context)
  const vite = await createViteServer({
    root: process.cwd(),
    appType: 'spa',
    server: { middlewareMode: true },
  })
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname.startsWith('/api/') || pathname.startsWith('/media/')) {
      apiHandler(req, res)
      return
    }
    vite.middlewares(req, res, () => {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not found')
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, resolve)
  })

  const shutdown = async () => {
    await vite.close()
    server.close(() => process.exit(0))
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  console.log(`ACT–MiniMax H3 curator: http://${config.host}:${config.port}/curation.html`)
  console.log(`Loaded ${items.length} samples; ${items.filter((item) => item.availability.complete).length} complete pairs.`)
  console.log(`Selections: ${selectionPath}`)
}

start().catch((error) => {
  console.error(error.stack ?? error.message ?? error)
  process.exitCode = 1
})
