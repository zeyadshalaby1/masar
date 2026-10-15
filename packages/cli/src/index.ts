import { defineCommand, runMain } from 'citty'
import { build } from './commands/build'
import { dbSync } from './commands/db-sync'
import { dev } from './commands/dev'
import { makeMigration, migrate, migrateStatus } from './commands/migrate'
import { makeModule } from './commands/make-module'
import { i18n } from './commands/i18n'
import { seed } from './commands/seed'
import { worker } from './commands/worker'
import { makeAdminPage, userRole } from './commands/admin'
import { routes } from './commands/routes'
import { start } from './commands/start'
import { printError, VERSION } from './ui'

const guard =
  <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) =>
  async (...args: A) => {
    try {
      await fn(...args)
    } catch (error) {
      printError(error)
      process.exit(1)
    }
  }

const port = { type: 'string', description: 'Port (default: PORT from .env, or 3000)' } as const
const toPort = (value?: string) => (value ? Number(value) : undefined)

const main = defineCommand({
  meta: { name: 'masar', version: VERSION, description: 'Masar — one clear path from idea to production.' },
  subCommands: {
    dev: defineCommand({
      meta: { description: 'Start the development server with hot reload' },
      args: { port },
      run: guard(({ args }) => dev({ port: toPort(args.port) })),
    }),
    build: defineCommand({
      meta: { description: 'Build the app for production into dist/' },
      run: guard(() => build()),
    }),
    start: defineCommand({
      meta: { description: 'Run the production build' },
      args: {
        port,
        sync: { type: 'boolean', description: 'Sync the database schema before starting' },
        worker: { type: 'boolean', default: true, description: 'Run queued jobs and schedules here too (--no-worker to leave them to masar worker)' },
      },
      run: guard(({ args }) => start({ port: toPort(args.port), sync: args.sync, worker: args.worker })),
    }),
    routes: defineCommand({
      meta: { description: 'List every page, action, API and custom route' },
      run: guard(() => routes()),
    }),
    'db:sync': defineCommand({
      meta: { description: 'Create missing tables/collections, columns and indexes from your schemas' },
      run: guard(() => dbSync()),
    }),
    worker: defineCommand({
      meta: { description: 'Run queued jobs and schedules without serving pages; run as many as you need' },
      args: { concurrency: { type: 'string', description: 'Jobs at the same time (default 5)' } },
      run: guard(({ args }) => worker({ concurrency: args.concurrency ? Number(args.concurrency) : undefined })),
    }),
    'db:seed': defineCommand({
      meta: { description: 'Fill the database with test data from each module seeds.ts' },
      args: {
        fresh: { type: 'boolean', description: 'Empty every table first' },
        module: { type: 'string', description: 'Only these modules (comma separated)' },
        seed: { type: 'string', description: 'Random seed, for the same data every time' },
        force: { type: 'boolean', description: 'Allow seeding when NODE_ENV=production' },
      },
      run: guard(({ args }) => seed({ fresh: args.fresh, module: args.module, seed: args.seed, force: args.force })),
    }),
    migrate: defineCommand({
      meta: { description: 'Run pending migrations, then sync the schema (the production deploy step)' },
      run: guard(() => migrate()),
    }),
    'migrate:status': defineCommand({
      meta: { description: 'List migrations that have not run yet' },
      run: guard(() => migrateStatus()),
    }),
    'make:migration': defineCommand({
      meta: { description: 'Create a migration in src/modules/<module>/migrations' },
      args: {
        module: { type: 'positional', description: 'Module name, e.g. courses', required: true },
        name: { type: 'positional', description: 'What it does, e.g. rename_title', required: true },
      },
      run: guard(({ args }) => makeMigration(args.module, args.name)),
    }),
    i18n: defineCommand({
      meta: { description: "Add every t('...') in src to src/locales/<code>.json and show what is left to translate" },
      run: guard(() => i18n()),
    }),
    'make:admin-page': defineCommand({
      meta: { description: 'Create a page in the admin, listed in its sidebar' },
      args: {
        title: { type: 'positional', description: 'Page title, e.g. "Sales report"', required: true },
        icon: { type: 'string', description: 'Lucide icon name, e.g. chart-bar (https://lucide.dev/icons)' },
        group: { type: 'string', description: 'Sidebar group, e.g. Reports' },
        force: { type: 'boolean', description: 'Overwrite an existing page' },
      },
      run: guard(({ args }) => makeAdminPage(args.title, { icon: args.icon, group: args.group, force: args.force })),
    }),
    'user:role': defineCommand({
      meta: { description: 'Give a user a role, e.g. admin (opens /admin for them)' },
      args: {
        email: { type: 'positional', description: 'The user email', required: true },
        role: { type: 'positional', description: 'Role name, e.g. admin', required: true },
      },
      run: guard(({ args }) => userRole(args.email, args.role)),
    }),
    'make:module': defineCommand({
      meta: { description: 'Create a module in src/modules' },
      args: {
        name: { type: 'positional', description: 'Module name, e.g. courses', required: true },
        crud: { type: 'boolean', description: 'Generate model, actions and pages (default true)' },
        ui: { type: 'boolean', description: 'Generate pages (default true; --no-ui for API only)' },
        api: { type: 'boolean', description: 'Expose actions as JSON under /api/<module>' },
        store: { type: 'string', description: 'Database connection name' },
        force: { type: 'boolean', description: 'Overwrite an existing module' },
      },
      run: guard(({ args }) =>
        makeModule(args.name, { crud: args.crud, ui: args.ui, api: args.api, store: args.store, force: args.force }),
      ),
    }),
  },
})

runMain(main)
