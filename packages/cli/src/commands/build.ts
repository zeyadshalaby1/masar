import pc from 'picocolors'
import { createBuilder } from 'vite'
import { findRoot, loadEnv, writeEntries } from '../project'
import { banner } from '../ui'
import { viteConfig } from '../vite'

export async function build() {
  const root = findRoot()
  process.env.NODE_ENV = 'production'
  loadEnv(root)
  writeEntries(root)
  banner('build')
  const started = Date.now()
  const builder = await createBuilder(viteConfig(root, { mode: 'production' }))
  await builder.build(builder.environments.client)
  await builder.build(builder.environments.ssr)
  console.log()
  console.log(`  ${pc.green('✓')} Built in ${((Date.now() - started) / 1000).toFixed(1)}s. Start it with: ${pc.cyan('masar start')}`)
  console.log()
}
