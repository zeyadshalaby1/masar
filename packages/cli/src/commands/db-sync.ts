import pc from 'picocolors'
import { loadApp } from '../load'
import { findRoot } from '../project'
import { syncAndReport } from '../sync'

export async function dbSync() {
  const { app, close } = await loadApp(findRoot())
  try {
    console.log()
    if (app.models.length === 0) console.log(pc.dim('  No models yet. Add one in src/modules/<name>/schema.ts'))
    await syncAndReport(app)
    console.log()
  } finally {
    await close()
  }
}
