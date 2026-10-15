#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { startWebSetup } from './web.js'

const here = dirname(fileURLToPath(import.meta.url))
const VERSION = '0.1.0'

// ── Arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const option = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const positional = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.match(/^--(db|pm)$/))
const yes = flag('yes') || !process.stdout.isTTY
const local = flag('local') // link to this monorepo's packages (before Masar is on npm)
// The browser setup page is the default; --cli (or any answer given as a flag) keeps it in the terminal.
const web = !yes && !flag('cli') && !option('db')

const DATABASES = {
  sqlite: {
    label: 'SQLite',
    hint: 'built into Node, nothing to install',
    connection: `main: { driver: 'sqlite', file: env('DB_FILE', 'database/app.sqlite') },`,
    env: () => `DB_FILE=database/app.sqlite`,
    dependency: null,
  },
  postgres: {
    label: 'PostgreSQL',
    hint: 'needs a running Postgres server',
    connection: `main: { driver: 'postgres', url: env('DATABASE_URL') },`,
    env: (name, url) => `DATABASE_URL=${url || `postgres://postgres:postgres@localhost:5432/${name.replace(/-/g, '_')}`}`,
    dependency: ['postgres', '^3.4.9'],
  },
  mongodb: {
    label: 'MongoDB',
    hint: 'needs a running MongoDB server',
    connection: `main: { driver: 'mongodb', url: env('MONGO_URL') },`,
    env: (name, url) => `MONGO_URL=${url || `mongodb://localhost:27017/${name}`}`,
    dependency: ['mongodb', '^7.0.0'],
  },
}

function packageManager() {
  const forced = option('pm')
  if (forced) return forced
  const agent = process.env.npm_config_user_agent ?? ''
  if (agent.startsWith('pnpm')) return 'pnpm'
  if (agent.startsWith('yarn')) return 'yarn'
  if (agent.startsWith('bun')) return 'bun'
  return 'npm'
}

function exitIfCancelled(value) {
  if (p.isCancel(value)) {
    p.cancel('Cancelled')
    process.exit(0)
  }
  return value
}

const validName = (v) => /^[a-z0-9][a-z0-9-_]*$/.test(v ?? '')
const folderTaken = (name) => {
  const target = resolve(name)
  return existsSync(target) && readdirSync(target).length > 0
}

/** Every setting the app is created from. Skipped questions keep these values. */
const defaults = () => ({
  name: positional ?? 'my-app',
  port: 3000,
  url: 'http://localhost:3000',
  pm: packageManager(),
  install: !flag('no-install'),
  db: 'sqlite',
  databaseUrl: '',
  locales: ['en', 'ar'],
  locale: 'en',
  timezone: '',
  mail: { driver: 'log' },
  storage: { driver: 'local' },
  admin: { email: 'admin@example.com', password: 'password', seed: false },
  agents: !flag('no-agents'),
})

// ── Writing the app ─────────────────────────────────────────────────────────
const q = (value) => (/[\s#"'=]/.test(value) ? `"${String(value).replace(/"/g, '\\"')}"` : value)
const line = (key, value, fallback) => (value ? `${key}=${q(value)}` : `# ${key}=${fallback ?? ''}`)

function envFile(a, key) {
  const database = DATABASES[a.db]
  const m = a.mail
  const s = a.storage
  return `APP_NAME=${q(basename(resolve(a.name)))}
APP_URL=${a.url}
PORT=${a.port}
# Signs sessions, links and uploaded-file references. Keep it secret and the same on every server.
APP_KEY=${key}

${database.env(basename(resolve(a.name)), key ? a.databaseUrl : '')}

# Mail: without RESEND_API_KEY or SMTP_HOST mails are printed in the terminal and listed at /_masar/mail
${line('MAIL_FROM', m.from, `"${basename(resolve(a.name))} <hello@example.com>"`)}
${line('RESEND_API_KEY', key && m.driver === 'resend' ? m.apiKey : '')}
${line('SMTP_HOST', m.driver === 'smtp' ? m.host : '')}
${line('SMTP_PORT', m.driver === 'smtp' ? m.port : '', '587')}
${line('SMTP_USER', key && m.driver === 'smtp' ? m.user : '')}
${line('SMTP_PASS', key && m.driver === 'smtp' ? m.pass : '')}

# Cloud storage (S3, Cloudflare R2, DigitalOcean Spaces, MinIO...): see src/config/storage.ts
${line('S3_BUCKET', s.driver === 's3' ? s.bucket : '')}
${line('S3_REGION', s.driver === 's3' ? s.region : '', 'auto')}
${line('S3_ENDPOINT', s.driver === 's3' ? s.endpoint : '')}
${line('S3_KEY', key && s.driver === 's3' ? s.key : '')}
${line('S3_SECRET', key && s.driver === 's3' ? s.secret : '')}
${line('S3_URL', s.driver === 's3' ? s.url : '')}

# The admin that \`masar db:seed\` creates
ADMIN_EMAIL=${q(a.admin.email)}
ADMIN_PASSWORD=${key ? q(a.admin.password) : ''}
`
}

const storageFile = (s3) => {
  const cloud = `cloud: {
      driver: 's3',
      bucket: env('S3_BUCKET'),
      region: env('S3_REGION', 'auto'),
      endpoint: env('S3_ENDPOINT', ''),
      key: env('S3_KEY'),
      secret: env('S3_SECRET'),
      url: env('S3_URL', ''), // public bucket or CDN domain; leave empty for private files
    },`
  return `import { defineStorage, env } from '@zeyadshalaby1/masar'

/**
 * Where uploads go. A file field picks a disk with f.file({ disk: 'private' }); otherwise \`default\`.
 * Local disks live under storage/ on the server. \`cloud\` is any S3-compatible service
 * (AWS S3, Cloudflare R2, Spaces, MinIO), configured by the S3_* values in .env.
 */
export default defineStorage({
  default: '${s3 ? 'cloud' : 'public'}',
  disks: {
    public: { driver: 'local', root: 'storage/public', url: '/storage' },
    private: { driver: 'local', root: 'storage/private' },
    ${s3 ? cloud : cloud.split('\n').map((l, i) => (i === 0 ? `// ${l}` : `    // ${l.slice(4)}`)).join('\n')}
  },
})
`
}

function writeApp(a) {
  const target = resolve(a.name)
  const appName = basename(target)
  const database = DATABASES[a.db]

  cpSync(join(here, 'template'), target, { recursive: true })
  renameSync(join(target, '_gitignore'), join(target, '.gitignore'))
  if (!a.agents) for (const file of ['AGENTS.md', 'CLAUDE.md']) rmSync(join(target, file), { force: true })

  const monorepo = resolve(here, '..')
  const masarVersion = (pkg) => (local ? `${a.pm === 'pnpm' ? 'link' : 'file'}:${join(monorepo, pkg)}` : `^${VERSION}`)
  const dependencies = {
    '@inertiajs/react': '^3.9.1',
    '@zeyadshalaby1/masar': masarVersion('core'),
    '@radix-ui/react-label': '^2.1.17',
    '@radix-ui/react-slot': '^1.5.0',
    'class-variance-authority': '^0.7.1',
    clsx: '^2.1.1',
    'lucide-react': '^1.57.0',
    react: '^19.2.0',
    'react-dom': '^19.2.0',
    'tailwind-merge': '^3.7.0',
    tailwindcss: '^4.1.14',
    'tw-animate-css': '^1.4.0',
  }
  if (database.dependency) dependencies[database.dependency[0]] = database.dependency[1]

  const pkg = {
    name: appName,
    private: true,
    type: 'module',
    engines: { node: '>=22.13' },
    scripts: {
      dev: 'masar dev',
      build: 'masar build',
      start: 'masar start',
      routes: 'masar routes',
      'db:sync': 'masar db:sync',
      'db:seed': 'masar db:seed',
      typecheck: 'tsc --noEmit',
    },
    dependencies: Object.fromEntries(Object.entries(dependencies).sort()),
    devDependencies: {
      '@zeyadshalaby1/masar-cli': masarVersion('cli'),
      '@types/node': '^24.0.0',
      '@types/react': '^19.2.0',
      '@types/react-dom': '^19.2.0',
      typescript: '^5.9.3',
    },
  }
  writeFileSync(join(target, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)

  writeFileSync(join(target, '.env'), envFile(a, randomBytes(32).toString('base64url')))
  writeFileSync(join(target, '.env.example'), envFile(a, ''))

  // Languages: the first one is the default.
  const locales = [a.locale, ...a.locales.filter((l) => l !== a.locale)]
  const appConfig = join(target, 'src/config/app.ts')
  writeFileSync(
    appConfig,
    readFileSync(appConfig, 'utf8')
      .replace(/locales: \[[^\]]*\],/, `locales: [${locales.map((l) => `'${l}'`).join(', ')}],${a.timezone ? `\n  // Scheduled tasks (at('03:00')) run in this timezone.\n  timezone: '${a.timezone.replace(/'/g, '')}',` : ''}`)
      .replace("env('PORT', 3000)", `env('PORT', ${a.port})`)
      .replace("env('APP_URL', 'http://localhost:3000')", `env('APP_URL', '${a.url.replace(/'/g, '')}')`),
  )
  for (const code of ['en', 'ar']) if (!locales.includes(code)) rmSync(join(target, `src/locales/${code}.json`), { force: true })

  writeFileSync(join(target, 'src/config/storage.ts'), storageFile(a.storage.driver === 's3'))

  writeFileSync(
    join(target, 'src/config/database.ts'),
    `import { defineDatabase, env } from '@zeyadshalaby1/masar'

/**
 * Database connections. Modules use \`default\` unless they set \`store\` in
 * their module.ts, so one app can keep some modules in SQL and others in MongoDB:
 *
 *   logs: { driver: 'mongodb', url: env('MONGO_URL') },
 *   // src/modules/activity/module.ts → store: 'logs'
 */
export default defineDatabase({
  default: 'main',
  connections: {
    ${database.connection}
  },
})
`,
  )

  const run = a.pm === 'npm' ? 'npm run' : a.pm
  writeFileSync(
    join(target, 'README.md'),
    `# ${appName}

Built with [Masar](https://masar.zeyad.io): one clear path from idea to production.
Docs: https://masar.zeyad.io/docs${a.agents ? '. AI agents: read AGENTS.md first.' : ''}

## Commands

| Command | What it does |
| --- | --- |
| \`${run} dev\` | Development server with hot reload, jobs and schedules |
| \`${run} build\` | Production build into \`dist/\` |
| \`${run} start\` | Run the production build |
| \`${run} db:seed\` | Admin account (ADMIN_EMAIL in .env) and sample data |
| \`npx masar make:module <name>\` | New module with model, actions and pages |
| \`npx masar routes\` | Every page, action, API and route |
| \`npx masar db:sync\` | Create missing tables, columns and indexes |

## Where things go

\`\`\`
src/
├── config/            app.ts, database.ts, mail.ts, storage.ts (values come from .env)
├── locales/           translations, filled in by masar dev
├── shared/            ui/ (shadcn), layouts/, components/, styles/, lib/
└── modules/
    └── <module>/
        ├── module.ts      name, prefix, store, ui/api, depends
        ├── schema.ts      models → tables or collections
        ├── actions.ts     business logic, validated with zod
        ├── routes.ts      extra HTTP routes (optional)
        ├── jobs/          background work
        ├── schedule.ts    recurring tasks
        ├── seeds.ts       sample data
        └── views/
            ├── pages/     one file = one URL; load() reads data on the server
            └── components/
\`\`\`

Add shadcn components with \`npx shadcn@latest add dialog\`; they land in \`src/shared/ui\`.
`,
  )
  return target
}

const exec = (command, args, cwd) =>
  new Promise((done) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
    let output = ''
    child.stdout.on('data', (d) => (output += d))
    child.stderr.on('data', (d) => (output += d))
    child.on('error', (error) => done({ ok: false, output: error.message }))
    child.on('close', (code) => done({ ok: code === 0, output }))
  })

/** Writes the app, installs, seeds. `report` receives the step list after every change. */
async function create(a, report) {
  const steps = [
    { id: 'files', label: 'Copy the starter app and write your settings', state: 'pending' },
    ...(a.install ? [{ id: 'install', label: `Install dependencies with ${a.pm}`, state: 'pending' }] : []),
    ...(a.install && a.admin.seed ? [{ id: 'seed', label: `Create the admin (${a.admin.email}) and sample data`, state: 'pending' }] : []),
  ]
  const set = (id, state) => {
    steps.find((s) => s.id === id).state = state
    report(steps)
  }
  const warnings = []

  set('files', 'active')
  const target = writeApp(a)
  set('files', 'done')

  let installed = false
  if (a.install) {
    set('install', 'active')
    const result = await exec(a.pm, ['install'], target)
    installed = result.ok
    set('install', result.ok ? 'done' : 'failed')
    if (!result.ok) {
      warnings.push(`${a.pm} install failed. Run it yourself inside ${a.name}.`)
      console.log(pc.dim(result.output.slice(-2000)))
    }
  }
  if (installed && a.admin.seed) {
    set('seed', 'active')
    const result = await exec(join(target, 'node_modules/.bin/masar'), ['db:seed'], target)
    set('seed', result.ok ? 'done' : 'failed')
    if (!result.ok) {
      warnings.push(`Sample data was not created (is the database running?). Run ${a.pm === 'npm' ? 'npm run' : a.pm} db:seed later.`)
      console.log(pc.dim(result.output.slice(-1500)))
    }
  }
  if (a.db !== 'sqlite' && !a.databaseUrl) warnings.push('Check the database URL in .env before starting.')

  const run = a.pm === 'npm' ? 'npm run' : a.pm
  const commands = [`cd ${a.name}`, ...(installed ? [] : [`${a.pm} install`]), `${run} dev`]
  return { commands, warnings, installed }
}

// ── Questions ────────────────────────────────────────────────────────────────
console.log()
const brand = (t) => (pc.isColorSupported ? `\x1b[48;2;255;90;31m\x1b[38;2;16;12;10m${t}\x1b[0m` : t)
p.intro(`${brand(' masar ')} ${pc.dim(`v${VERSION} · one clear path from idea to production`)}`)

if (web) {
  const setup = await startWebSetup({
    version: VERSION,
    defaults: { ...defaults(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, adminPassword: randomBytes(9).toString('base64url') },
    validate: (a) => {
      if (!validName(a.name)) return { field: 'project', error: 'Project name: use lowercase letters, numbers and dashes.' }
      if (folderTaken(a.name)) return { field: 'project', error: `${a.name} already exists and is not empty. Pick another name.` }
      if (!DATABASES[a.db]) return { field: 'project', error: 'Unknown database.' }
      if (!['npm', 'pnpm', 'yarn', 'bun'].includes(a.pm)) return { field: 'project', error: 'Unknown package manager.' }
      if (!Array.isArray(a.locales) || !a.locales.length || !a.locales.every((l) => ['en', 'ar'].includes(l)) || !a.locales.includes(a.locale))
        return { field: 'languages', error: 'Pick at least one language, and a default from them.' }
      return null
    },
  })
  p.log.step(`Finish the setup in your browser:\n${pc.cyan(setup.url)}`)
  p.log.message(pc.dim(setup.opened ? 'It opened on its own. Every step can be skipped. Prefer the terminal? Press Ctrl+C and run again with --cli.' : 'Open the link above. Prefer the terminal? Press Ctrl+C and run again with --cli.'))
  const answers = { ...defaults(), ...(await setup.answers) }
  const spinner = p.spinner()
  let current = ''
  const result = await create(answers, (steps) => {
    setup.progress(steps)
    const active = steps.find((s) => s.state === 'active')
    if (active && active.label !== current) {
      if (current) spinner.stop(current)
      current = active.label
      spinner.start(current)
    }
  })
  if (current) spinner.stop(current)
  await setup.finish(result)
  done(answers, result)
} else {
  const a = defaults()
  let name = positional
  if (!name) {
    name = yes
      ? 'masar-app'
      : exitIfCancelled(
          await p.text({
            message: 'Project name',
            placeholder: 'my-app',
            defaultValue: 'my-app',
            validate: (v) => (!v || validName(v) ? undefined : 'Use lowercase letters, numbers and dashes'),
          }),
        )
  }
  a.name = name
  if (folderTaken(name)) {
    p.cancel(`${name} already exists and is not empty. Pick another name.`)
    process.exit(1)
  }

  let db = option('db')
  if (!db || !DATABASES[db]) {
    db = yes
      ? 'sqlite'
      : exitIfCancelled(
          await p.select({
            message: 'Which database?',
            options: Object.entries(DATABASES).map(([value, d]) => ({ value, label: d.label, hint: d.hint })),
            initialValue: 'sqlite',
          }),
        )
  }
  a.db = db
  a.install = flag('no-install')
    ? false
    : yes || flag('install')
      ? true
      : exitIfCancelled(await p.confirm({ message: `Install dependencies with ${a.pm}?`, initialValue: true }))

  const spinner = p.spinner()
  let current = ''
  const result = await create(a, (steps) => {
    const active = steps.find((s) => s.state === 'active')
    if (active && active.label !== current) {
      if (current) spinner.stop(current)
      current = active.label
      spinner.start(current)
    }
  })
  if (current) spinner.stop(current)
  done(a, result)
}

function done(a, { commands, warnings }) {
  p.note(commands.join('\n'), 'Next steps')
  for (const warning of warnings) p.log.warn(warning)
  if (a.agents) p.log.info(`AGENTS.md and CLAUDE.md teach AI agents the framework. Docs: ${pc.cyan('https://masar.zeyad.io/docs')}`)
  p.outro(`Then create your first module: ${pc.cyan('npx masar make:module courses')}  ${pc.dim('· designed by Zeyad Shalaby')}`)
}
