import pc from 'picocolors'
import { loadApp } from '../load'
import { findRoot, writeRoutes } from '../project'
import { table } from '../ui'

const kindColor = { page: pc.green, action: pc.magenta, api: pc.cyan, route: pc.yellow } as const

export async function routes() {
  const root = findRoot()
  const { app, close } = await loadApp(root)
  try {
    writeRoutes(root, app)
    console.log()
    table(
      app.routes.map((r) => [pc.bold(r.method), r.path, kindColor[r.kind](r.kind), r.module, pc.dim(r.target)]),
      ['METHOD', 'PATH', 'KIND', 'MODULE', 'TARGET'],
    )
    console.log()
    console.log(pc.dim(`  ${app.routes.length} routes · actions are also callable at POST /_masar/actions/<module>/<name>`))
    console.log()
  } finally {
    await close()
  }
}
