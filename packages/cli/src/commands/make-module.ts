import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { moduleFiles, type ModuleOptions } from '../generators/module'
import { findRoot } from '../project'
import { orange } from '../ui'

interface Flags {
  crud?: boolean
  ui?: boolean
  api?: boolean
  store?: string
  force?: boolean
}

export async function makeModule(name: string, flags: Flags) {
  const root = findRoot()
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    throw Object.assign(new Error(`"${name}" is not a valid module name`), {
      hint: 'Use lowercase letters and dashes, plural for data modules: courses, blog-posts, invoices.',
    })
  }
  const dir = join(root, 'src/modules', name)
  if (existsSync(dir) && !flags.force) {
    throw Object.assign(new Error(`src/modules/${name} already exists`), { hint: 'Pick another name or pass --force to overwrite.' })
  }

  const options: ModuleOptions = { crud: flags.crud ?? true, ui: flags.ui ?? true, api: flags.api ?? false, store: flags.store }
  const asked = flags.crud === undefined && flags.ui === undefined && flags.api === undefined
  if (asked && process.stdout.isTTY) {
    p.intro(`${orange('◆')} New module ${pc.bold(name)}`)
    const expose = await p.select({
      message: 'What does this module expose?',
      options: [
        { value: 'ui', label: 'UI pages', hint: 'React pages + actions' },
        { value: 'both', label: 'UI pages and a JSON API', hint: 'pages, plus /api/' + name + '/...' },
        { value: 'api', label: 'JSON API only', hint: 'for mobile apps and integrations' },
      ],
    })
    if (p.isCancel(expose)) return p.cancel('Cancelled')
    const crud = await p.confirm({ message: 'Generate CRUD (model, actions, pages)?', initialValue: true })
    if (p.isCancel(crud)) return p.cancel('Cancelled')
    options.ui = expose !== 'api'
    options.api = expose !== 'ui'
    options.crud = crud
  }

  const files = moduleFiles(name, options)
  for (const [file, content] of Object.entries(files)) {
    const target = join(dir, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }

  console.log()
  console.log(`  ${pc.green('✓')} Created ${pc.bold(`src/modules/${name}`)}`)
  for (const file of Object.keys(files).filter((f) => !f.endsWith('.gitkeep'))) {
    console.log(pc.dim(`    ${relative(root, join(dir, file))}`))
  }
  console.log()
  if (options.ui) console.log(`  Open ${pc.cyan(`http://localhost:3000/${name}`)} while ${pc.bold('masar dev')} is running.`)
  if (options.api) console.log(`  API: ${pc.cyan(`/api/${name}/<action>`)} (see ${pc.bold('masar routes')})`)
  console.log()
}
