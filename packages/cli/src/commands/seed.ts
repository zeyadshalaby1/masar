import pc from 'picocolors'
import { loadApp } from '../load'
import { findRoot } from '../project'
import { orange } from '../ui'

export async function seed(options: { fresh?: boolean; module?: string; seed?: string; force?: boolean }) {
  if (process.env.NODE_ENV === 'production' && !options.force) {
    throw Object.assign(new Error('Refusing to seed a production database'), {
      hint: 'Seeds are test data. If you really mean it, run masar db:seed --force.',
    })
  }
  const { app, close } = await loadApp(findRoot())
  try {
    console.log()
    if (options.fresh) console.log(`  ${pc.yellow('!')} ${pc.bold('Emptying every table')} ${pc.dim('(--fresh)')}`)
    await app.sync()
    const report = await app.seed({
      fresh: options.fresh,
      only: options.module ? options.module.split(',') : undefined,
      seed: options.seed ? Number(options.seed) : undefined,
      log: (line) => console.log(`     ${pc.dim(line)}`),
    })
    if (report.length === 0) console.log(pc.dim('  No seeds yet. Add src/modules/<name>/seeds.ts with export default defineSeed(...)'))
    for (const r of report) console.log(`  ${orange('➜')}  ${pc.bold('Seeded'.padEnd(9))} ${r.module} ${pc.dim(`${r.ms}ms`)}`)
    console.log()
  } finally {
    await close()
  }
}
