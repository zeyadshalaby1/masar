import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import pc from 'picocolors'
import { loadApp } from '../load'
import { findRoot } from '../project'
import { orange } from '../ui'

const kebab = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const pascal = (text: string) => kebab(text).replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())

/** masar make:admin-page "Sales report" --icon chart-bar --group Reports */
export async function makeAdminPage(title: string, options: { icon?: string; group?: string; force?: boolean }) {
  const root = findRoot()
  const dir = join(root, 'src/modules/admin/views/pages')
  if (!existsSync(join(root, 'src/modules/admin/module.ts'))) {
    throw Object.assign(new Error('This app has no admin module'), { hint: 'Copy src/modules/admin from a new app (npm create masar), then run this again.' })
  }
  const slug = kebab(title)
  if (!slug) throw Object.assign(new Error('Give the page a title'), { hint: 'e.g. masar make:admin-page "Sales report" --icon chart-bar' })
  const file = join(dir, `${slug}.tsx`)
  if (existsSync(file) && !options.force) throw Object.assign(new Error(`${relative(root, file)} already exists`), { hint: 'Pick another title or pass --force.' })
  const icon = options.icon ? kebab(options.icon) : 'file'
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    file,
    `import { AdminPage, Card, Chart, StatCard, useAdminT } from '@zeyadshalaby1/masar/admin'
import type { AdminPageMeta } from '@zeyadshalaby1/masar/admin'

// Shown in the admin sidebar. Icons: any Lucide name in kebab-case (https://lucide.dev/icons).
export const admin: AdminPageMeta = { title: '${title.replace(/'/g, "\\'")}', icon: '${icon}'${options.group ? `, group: '${options.group.replace(/'/g, "\\'")}'` : ''} }

/** Runs on the server before the page renders (admins only, like the rest of the admin module). */
export async function load() {
  return {
    total: 0,
    points: [
      { label: 'Mon', value: 3 },
      { label: 'Tue', value: 5 },
      { label: 'Wed', value: 2 },
    ],
  }
}

export default function ${pascal(title)}Page({ total, points }: Awaited<ReturnType<typeof load>>) {
  const t = useAdminT()
  return (
    <AdminPage title={t('${title.replace(/'/g, "\\'")}')} icon="${icon}">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('Total')} value={total} icon="${icon}" />
      </div>
      <Card className="p-5">
        <Chart data={points} />
      </Card>
    </AdminPage>
  )
}
`,
  )
  console.log(`\n  ${orange('◆')} Created ${pc.bold(relative(root, file))} ${pc.dim(`→ /admin/${slug}`)}\n`)
}

/** masar user:role ziad@example.com admin */
export async function userRole(email: string, role: string) {
  const { vite, close } = await loadApp(findRoot())
  try {
    // Through the app's own module graph, so db() uses the connections the app configured.
    const runner = (vite.environments.ssr as unknown as { runner: { import(id: string): Promise<unknown> } }).runner
    const { db, users } = (await runner.import('@zeyadshalaby1/masar')) as typeof import('@zeyadshalaby1/masar')
    const user = await db(users).where({ email: email.trim().toLowerCase() }).first()
    if (!user) throw Object.assign(new Error(`No user with email ${email}`), { hint: 'Sign up in the app first (/register), then run this again.' })
    await db(users).update(user.id, { role })
    console.log(`\n  ${orange('◆')} ${pc.bold(user.email)} is now ${pc.bold(role)}\n`)
  } finally {
    await close()
  }
}
