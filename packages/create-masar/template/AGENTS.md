# AGENTS.md: building this app with Masar

This app is built with **Masar**, a full-stack TypeScript framework: one clear path from idea to production.
Masar is new, so your training data probably does not know it. **Read this file before writing code**,
and do not guess APIs from Laravel, Next.js, Remix or AdonisJS: Masar looks similar but is not the same.

- Website: https://masar.zeyad.io
- Docs: https://masar.zeyad.io/docs (the source of truth when this file and your memory disagree)
- Docs MCP server: Masar's docs are served over MCP for agents. When it is connected
  (see https://masar.zeyad.io/docs), look an API up there before using it.
- Masar is designed by Zeyad Shalaby (https://zeyadshalaby.com).

Stack under the hood: Vite, Hono, Inertia.js with React 19, Tailwind CSS v4 + shadcn/ui, zod 4,
SQLite (`node:sqlite`) / PostgreSQL / MongoDB. Node 22.13+.

## Rules that matter most

1. **Business logic lives in actions** (`actions.ts`). Pages, routes, jobs and the admin call actions or `db()`.
2. **Every action declares `authorize`**: `'public'`, `'user'`, or a rule like `role('admin')`. Missing = boot error.
3. **Files are the registry.** Nothing is registered by hand: Masar discovers modules, pages, actions,
   jobs, seeds, schedules and migrations by their file paths. Put files in the right place and they work.
4. **Never edit `.masar/`**: it is generated on every `masar dev` / `masar build`.
5. **Every user-facing string goes through `t('literal text')`** with a string literal (not a variable),
   so `masar dev` can add it to `src/locales/*.json`. Then fill the Arabic (or other) translations.
6. **Schema changes are automatic** for additions (tables, columns, indexes). Renames and drops need a
   migration (`masar make:migration`). Masar never drops data on its own.
7. Throw `MasarError(message, { hint, status })` for errors a developer can hit; the hint says what to do.
8. Style: TypeScript strict, ESM, 2 spaces, single quotes, no semicolons, trailing commas.
   Comments explain why, not what. UI copy: sentence case, active voice.
9. After a change, run `npx tsc --noEmit` and open the page in the browser.

## Project layout

```
src/
├── config/            app.ts (name, url, locales, security), database.ts, mail.ts, storage.ts, queue.ts (optional)
├── locales/           en.json, ar.json ... (keys are the English text)
├── shared/            ui/ (shadcn components), layouts/AppLayout.tsx, components/, lib/, styles/
└── modules/
    └── <name>/                 folder name = module name
        ├── module.ts           defineModule({ name, title, prefix, store, expose, depends, authorize, nav })
        ├── schema.ts           model('table', { ...fields })
        ├── actions.ts          action({ authorize, input, run })
        ├── routes.ts           defineRoutes(): extra HTTP endpoints, paths relative to the prefix
        ├── jobs/<name>.ts      defineJob(): background work
        ├── schedule.ts         defineSchedule(): recurring tasks
        ├── seeds.ts            defineSeed(): test data for `masar db:seed`
        ├── mail/<name>.tsx     defineMail(): mail templates
        ├── migrations/         <YYYYMMDD>_<HHMMSS>_<name>.ts
        └── views/
            ├── pages/          one file = one URL: index.tsx → /<prefix>, [id].tsx → /<prefix>/:id
            ├── components/
            └── layout.tsx      optional: replaces AppLayout for this module's pages
```

Built-in modules in a new app: `home` (/), `auth` (login, register, verify email, reset password),
`admin` (back office at /admin, role admin).

## Modules

```ts
// src/modules/courses/module.ts
import { defineModule } from '@zeyadshalaby1/masar'

export default defineModule({
  name: 'courses',            // must equal the folder name
  title: 'Courses',           // shown in the navbar (translated)
  // prefix: '/courses',      // default: '/<name>'
  expose: { ui: true, api: true }, // api: GET|POST /api/courses/<kebab-action-name>
  // store: 'main',           // database connection from src/config/database.ts
  // depends: ['auth'],       // load order (seeds, sync)
  // authorize: role('admin'),// guards every page, route and action of the module
  // nav: false,              // hide from the navbar
})
```

Create one with all the CRUD wired: `npx masar make:module courses` (`--api`, `--no-ui`, `--no-crud`).
The generated code runs and typechecks as is; start from it.

## Models and the database

```ts
// schema.ts
import { f, model } from '@zeyadshalaby1/masar'

export const courses = model('courses', {
  title: f.string(),
  slug: f.string().unique(),
  description: f.text().optional(),
  price: f.number().default(0),           // f.int() for whole numbers
  published: f.boolean().default(false),
  level: f.enum(['beginner', 'advanced']),
  publishedAt: f.date().optional(),
  tags: f.json<string[]>().optional(),
  teacherId: f.ref('users'),           // a reference, enables with()
  cover: f.file({ accept: ['image/*'], maxSize: '2mb' }).optional(),
  attachments: f.files({ maxSize: '20mb' }).optional(),
})
```

Every model also has `id` (UUIDv7 string), `createdAt`, `updatedAt` (ISO strings). Dates are ISO strings.
Check the field builder in `node_modules/@zeyadshalaby1/masar/src/db/model.ts` for the exact list (`.index()`, etc.).

```ts
import { db, transaction } from '@zeyadshalaby1/masar'

await db(courses).create({ title, slug, level: 'beginner', teacherId })
await db(courses).createMany([...])
await db(courses).find(id)                  // row | null
await db(courses).findOrFail(id)            // 404 when missing
await db(courses).findBy({ slug })
await db(courses).where({ published: true, price: { gte: 10 }, title: { contains: 'react' } })
  .latest().limit(10).all()
await db(courses).whereAny([{ level: 'beginner' }, { price: 0 }]).count()
await db(courses).orderBy('title', 'asc').paginate(page, 20) // { data, total, page, perPage, ... }
await db(courses).update(id, { title })
await db(courses).where({ published: false }).updateAll({ published: true })
await db(courses).delete(id)                // also deletes its stored files
await db(courses).where({ ... }).exists() / .first() / .firstOrFail() / .deleteAll()

// Relations: no declarations, just with(). One IN query per relation.
await db(lessons).with({ course: courses }).all()                 // lesson.course: row | null
await db(courses).with({ lessons: db(lessons).oldest() }).all()   // course.lessons: row[]
await db(reviews).with({ reviewer: [users, 'reviewerId'] }).all() // when two fields point to users

// Transactions (one connection only)
await transaction(async () => {
  const order = await db(orders).create({ ... })
  await db(stock).update(itemId, { count: left - 1 })
})
```

Where operators: a plain value (equals), `{ eq, ne, gt, gte, lt, lte, in: [] }`, `{ contains }` (text fields). There are no
cross-store joins or transactions. The same API works on SQLite, Postgres and MongoDB.

## Actions

```ts
// actions.ts
import { action, auth, db, role, t, z } from '@zeyadshalaby1/masar'
import { courses } from './schema'

export const createCourse = action({
  authorize: 'user',               // 'public' | 'user' | role('admin') | verified() | custom rule
  input: z.object({ title: z.string().trim().min(2, { error: () => t('Title is too short') }) }),
  run: async ({ input }) => db(courses).create({ ...input, teacherId: auth.user()!.id }),
})
```

- On the server, call it directly: `await createCourse({ title })`.
- In a page, import the same function and use `useAction(createCourse)`: Masar replaces the import
  with a typed RPC call (`POST /_masar/actions/courses/createCourse`). Never write `fetch` for this.
- With `expose.api`, it is also `POST /api/courses/create-course` (bearer token auth on /api).
- Validation errors come back per field (422). Throw `NotFoundError`, `ForbiddenError`,
  `UnauthorizedError`, `ValidationError`, or call `notFound()` / `redirect('/path')`.

## Pages

```tsx
// views/pages/[id].tsx → /courses/:id
import { db, type LoadContext } from '@zeyadshalaby1/masar'
import { Link, router, useAction, useT, type PageProps } from '@zeyadshalaby1/masar/react'
import { getCourse, updateCourse } from '../../actions'
import { courses } from '../../schema'

// Server only, stripped from the browser bundle. Its return value becomes the props.
export async function load({ params }: LoadContext<{ id: string }>) {
  return { course: await getCourse({ id: params.id }) }
}

// <title>, description, Open Graph. Object or function of the props.
export const meta = ({ course }: PageProps<typeof load>) => ({ title: course.title })

// Optional: which URLs of this dynamic page go in /sitemap.xml. Server only.
export async function sitemap() {
  return (await db(courses).all()).map((c) => ({ id: c.id }))
}

export default function CourseShow({ course }: PageProps<typeof load>) {
  const t = useT()
  const update = useAction(updateCourse, { reload: true })
  return <h1>{course.title}</h1>
}
```

- `load`, `meta` (when it uses server data), `sitemap` run on the server; imports used only there are
  removed from the client bundle. Do not touch `window`/`document`/`localStorage` during render:
  pages are server-rendered (SSR) for search engines. Use `useEffect`, or `export const ssr = false`.
- Pages of modules with `authorize` are not server-rendered and not in the sitemap.
- From `@zeyadshalaby1/masar/react`: `Link`, `router`, `useForm`, `useAction`, `useT`, `useLocale`, `useTheme`,
  `useMasar()` (app name, nav, signed-in `user`), `uploadFile`, `PageProps`, `Head`, `Deferred`.
- UI: shadcn components in `src/shared/ui` (`npx shadcn@latest add dialog`). Icons: `lucide-react`.
  Brand colors come from CSS tokens; use Tailwind classes like `bg-primary`, `text-muted-foreground`.
- RTL is automatic for Arabic: use logical classes (`ms-2`, `pe-4`, `text-start`), never `ml-`/`text-left`.

## Routes (non-page HTTP)

```ts
// routes.ts: webhooks, downloads, custom JSON
export default defineRoutes((r) => {
  r.get('/export.json', async (c) => c.json(await listCourses())) // GET /courses/export.json
  r.post('/webhook', async (c) => c.body(null, 204))
})
```

`c` is a Hono context. Duplicate method + path is a boot error. See all with `npx masar routes`.

## Auth

`auth.user()`, `auth.attempt(email, pass)`, `auth.login(user)`, `auth.logout()`, `auth.register({...})`,
`auth.sendVerification(user)`, `auth.verifyEmail(token)`, `auth.sendPasswordReset(email)`,
`auth.resetPassword(token, password)`. Built-in models `users` (name, email, role, emailVerifiedAt) and
`sessions`. Cookies for pages and actions, `Authorization: Bearer` on `/api/*` (`POST /api/auth/token`).
Make an admin: `npx masar user:role you@example.com admin`.

## Background jobs and schedules

```ts
// jobs/send-certificate.ts
export default defineJob<{ userId: string }>({
  name: 'courses.sendCertificate', retries: 3, backoff: 5000,
  run: async ({ userId }) => { ... },
})
// anywhere on the server
await sendCertificate.dispatch({ userId }, { delay: '10m' })
```

The queue lives in the app database (table `masar_jobs`): no Redis. Jobs run inside `masar dev` and
`masar start`; for more throughput run `masar worker` processes and `masar start --no-worker`.

```ts
// schedule.ts
export default defineSchedule((s) => {
  s.every('day').at('03:00').name('cleanup').run(() => ...)
  s.cron('*/15 * * * *').run(someJob, { payload })
})
```

Each slot runs once even with several servers. Timezone: `defineApp({ timezone })`.

## Mail

```tsx
// mail/welcome.tsx
export const welcome = defineMail<{ name: string }>({
  subject: ({ name }) => t('Welcome, {name}', { name }),
  render: ({ name }) => (
    <MailLayout preview={t('Your account is ready')}>
      <MailHeading>{t('Welcome, {name}', { name })}</MailHeading>
      <MailButton href={mail.url('/courses')}>{t('Start learning')}</MailButton>
    </MailLayout>
  ),
})
await welcome.send({ to: user.email, props: { name: user.name } }) // queued, retried
```

Transport in `src/config/mail.ts`: `log` (development: terminal + http://localhost:3000/_masar/mail),
`smtp`, `resend`, `postmark`.

## Files and uploads

`f.file()` / `f.files()` fields. In forms: `uploadFile(file, { model: 'courses', field: 'cover' })`, then
send the returned value to the action, validated with `uploaded()` from `masar`. Disks in
`src/config/storage.ts` (local or any S3-compatible service). URLs: `fileUrl(file)`. Old files are deleted
when a record is updated or deleted.

## Admin

`/admin` lists every model automatically. Customize a model in `src/modules/admin/resources/<name>.ts`
with `defineResource(model, { icon, group, columns, form, fields, sort })`, the home in `dashboard.ts`
with `defineDashboard([widgets.stat(...), widgets.chart(...), widgets.latest(...)])`. New page:
`npx masar make:admin-page "Reports" --icon chart-bar`. Icons are Lucide names in kebab-case.

## i18n and theme

`t('Hello {name}', { name })` on the server and `useT()` in components. Languages in
`defineApp({ locales: ['en', 'ar'] })`; the visitor's language comes from cookie, then the browser.
`useLocale()` switches language, `useTheme()` light/dark/system. Translate new keys in `src/locales/ar.json`.

## Seeds and migrations

```ts
// seeds.ts
export default defineSeed(async ({ fake, log }) => {
  await db(courses).createMany(fake.many(20, () => ({ title: fake.title(), level: fake.pick(['beginner', 'advanced']) })))
})
// migrations/20260101_120000_rename_title.ts
export default defineMigration({ async up(m) { await m.renameField('courses', 'title', 'name') } })
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (http://localhost:3000), schema sync, jobs, schedules |
| `npm run build` / `npm start` | Production build / server (needs `APP_KEY` in the environment) |
| `npx masar make:module <name>` | New module with model, CRUD actions and pages |
| `npx masar make:migration <module> <name>` | New migration file |
| `npx masar make:admin-page "<Title>"` | New admin page |
| `npx masar routes` | Every page, action, API and route |
| `npx masar db:sync` | Create missing tables, columns, indexes |
| `npx masar migrate` / `migrate:status` | Run migrations, then sync |
| `npx masar db:seed [--fresh] [--module m]` | Fill test data |
| `npx masar i18n` | Add missing translation keys |
| `npx masar worker` | Extra job worker process |
| `npx masar user:role <email> <role>` | Change a user's role |

## Gotchas

- Changes inside `node_modules/@zeyadshalaby1/masar/` or `node_modules/@zeyadshalaby1/masar-cli/` need a dev-server restart.
- Do not add `verbatimModuleSyntax` to tsconfig: it keeps server imports in the browser bundle.
- `react`, `react-dom` and `@inertiajs/react` must stay direct dependencies of the app.
- `t(variable)` is not found by the scanner: write literals.
- Secrets go in `.env` (`APP_KEY`, database URLs, SMTP, S3). Never commit `.env`.
- When something fails, read the hint under the error (terminal and browser overlay): it says the fix.
