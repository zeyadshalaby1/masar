export interface ModuleOptions {
  crud: boolean
  ui: boolean
  api: boolean
  store?: string
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function singular(word: string): string {
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y')
  if (/(ss|x|z|ch|sh)es$/.test(word)) return word.replace(/es$/, '')
  if (/[^s]s$/.test(word)) return word.slice(0, -1)
  return word
}

export function names(raw: string) {
  const words = raw.split('-')
  const one = [...words.slice(0, -1), singular(words[words.length - 1])]
  const Plural = words.map(cap).join('')
  const Single = one.map(cap).join('')
  return {
    module: raw,
    table: raw.replace(/-/g, '_'),
    title: words.map(cap).join(' '),
    singularTitle: one.join(' '),
    Plural,
    Single,
    plural: Plural.charAt(0).toLowerCase() + Plural.slice(1),
    single: Single.charAt(0).toLowerCase() + Single.slice(1),
  }
}

type Names = ReturnType<typeof names>

function moduleFile(n: Names, o: ModuleOptions) {
  return `import { defineModule } from '@zeyadshalaby1/masar'

export default defineModule({
  name: '${n.module}',
  title: '${n.title}',
  expose: { ui: ${o.ui}, api: ${o.api} },
${o.store ? `  store: '${o.store}',\n` : `  // store: 'main',        // database connection from src/config/database.ts\n`}  // depends: ['users'],    // modules this one needs
})
`
}

function schemaFile(n: Names) {
  return `import { f, model } from '@zeyadshalaby1/masar'

/**
 * Every model gets id, createdAt and updatedAt automatically.
 * Change fields here: \`masar dev\` adds new tables, columns and indexes for you.
 */
export const ${n.plural} = model('${n.table}', {
  title: f.string(),
  description: f.text().optional(),
})
`
}

function crudActions(n: Names) {
  return `import { action, db, t, z } from '@zeyadshalaby1/masar'
import { ${n.plural} } from './schema'

const ${n.single}Input = z.object({
  title: z.string().trim().min(2, { error: () => t('Title is too short') }).max(200),
  description: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => value || null),
})

// Signed-in users only. Narrow any action with role('admin'), e.g. for delete.
export const list${n.Plural} = action({
  authorize: 'user',
  input: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      search: z.string().trim().optional(),
    })
    .optional(),
  run: ({ input }) =>
    db(${n.plural})
      .where(input?.search ? { title: { contains: input.search } } : {})
      .latest()
      .paginate(input?.page ?? 1, 20),
})

export const get${n.Single} = action({
  authorize: 'user',
  input: z.object({ id: z.string() }),
  run: ({ input }) => db(${n.plural}).findOrFail(input.id),
})

export const create${n.Single} = action({
  authorize: 'user',
  input: ${n.single}Input,
  run: ({ input }) => db(${n.plural}).create(input),
})

export const update${n.Single} = action({
  authorize: 'user',
  input: ${n.single}Input.extend({ id: z.string() }),
  run: ({ input: { id, ...data } }) => db(${n.plural}).update(id, data),
})

export const delete${n.Single} = action({
  authorize: 'user',
  input: z.object({ id: z.string() }),
  run: ({ input }) => db(${n.plural}).delete(input.id),
})
`
}

function basicActions(n: Names) {
  return `import { action, z } from '@zeyadshalaby1/masar'

/** Business logic lives in actions. Pages call them directly, on the server or in the browser. */
export const greet = action({
  // Actions are closed by default: 'public', 'user' (signed in) or role('admin').
  authorize: 'public',
  input: z.object({ name: z.string().trim().min(1) }).optional(),
  run: ({ input }) => ({ message: \`Hello \${input?.name ?? 'from ${n.title}'}\` }),
})
`
}

function routesFile(n: Names, o: ModuleOptions) {
  const example = o.crud
    ? `  // GET /${n.module}/export.json
  r.get('/export.json', async (c) => c.json(await list${n.Plural}()))`
    : `  // GET /${n.module}/ping
  r.get('/ping', (c) => c.json({ ok: true }))`
  return `import { defineRoutes } from '@zeyadshalaby1/masar'
${o.crud ? `import { list${n.Plural} } from './actions'\n` : ''}
/**
 * Extra HTTP routes (webhooks, downloads, custom endpoints).
 * Paths are relative to this module's prefix. Pages and actions are wired
 * automatically and don't need entries here.
 */
export default defineRoutes((r) => {
${example}
})
`
}

function formComponent(n: Names) {
  return `import { useT } from '@zeyadshalaby1/masar/react'
import type { FormEvent } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

export interface ${n.Single}Values {
  title: string
  description: string
}

interface Props {
  defaultValues?: { title?: string; description?: string | null }
  submitLabel: string
  pending: boolean
  errors: Record<string, string>
  error?: string | null
  onSubmit: (values: ${n.Single}Values) => Promise<unknown>
  /** Clear the form after a successful submit. */
  resetOnSuccess?: boolean
}

export function ${n.Single}Form({ defaultValues, submitLabel, pending, errors, error, onSubmit, resetOnSuccess }: Props) {
  const t = useT()
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const result = await onSubmit({
      title: String(data.get('title') ?? ''),
      description: String(data.get('description') ?? ''),
    })
    if (result !== undefined && resetOnSuccess) form.reset()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="title">{t('Title')}</Label>
        <Input id="title" name="title" defaultValue={defaultValues?.title ?? ''} aria-invalid={Boolean(errors.title)} />
        {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">{t('Description')}</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ''}
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t('Saving…') : submitLabel}
        </Button>
      </div>
    </form>
  )
}
`
}

function indexPage(n: Names) {
  return `import type { LoadContext } from '@zeyadshalaby1/masar'
import { Link, router, useAction, useT, type PageProps } from '@zeyadshalaby1/masar/react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { create${n.Single}, delete${n.Single}, list${n.Plural} } from '../../actions'
import { ${n.Single}Form } from '../components/${n.Single}Form'

// Title and description for search engines and link previews.
export const meta = (_props: unknown, t: (key: string) => string) => ({ title: t('${n.title}') })

/** Runs on the server before the page renders. Masar removes it from the browser bundle. */
export async function load({ query }: LoadContext) {
  const search = query.get('q') ?? ''
  return {
    ${n.plural}: await list${n.Plural}({ page: Number(query.get('page') ?? 1), search: search || undefined }),
    search,
  }
}

export default function ${n.Plural}Index({ ${n.plural}, search }: PageProps<typeof load>) {
  const t = useT()
  // In the browser, actions become typed calls to the server.
  const create = useAction(create${n.Single}, { reload: true })
  const remove = useAction(delete${n.Single}, { reload: true })
  const link = (page: number) => ({ page: String(page), ...(search ? { q: search } : {}) })

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('${n.title}')}</h1>
          <p className="text-sm text-muted-foreground">{t('{count} in total', { count: ${n.plural}.total })}</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const q = String(new FormData(event.currentTarget).get('q') ?? '')
            router.get('/${n.module}', q ? { q } : {}, { preserveState: true })
          }}
        >
          <Input name="q" defaultValue={search} placeholder={t('Search by title')} className="w-56" />
          <Button type="submit" variant="outline">
            {t('Search')}
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('New ${n.singularTitle}')}</CardTitle>
          <CardDescription>{t('Saved through the create${n.Single} action, validated on the server.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <${n.Single}Form
            submitLabel={t('Create')}
            pending={create.pending}
            errors={create.errors}
            error={create.error}
            onSubmit={create.run}
            resetOnSuccess
          />
        </CardContent>
      </Card>

      <ul className="divide-y rounded-xl border bg-card">
        {${n.plural}.data.length === 0 && (
          <li className="p-6 text-sm text-muted-foreground">{search ? t('Nothing matches your search.') : t('Nothing here yet.')}</li>
        )}
        {${n.plural}.data.map((${n.single}) => (
          <li key={${n.single}.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <Link href={\`/${n.module}/\${${n.single}.id}\`} className="font-medium hover:underline">
                {${n.single}.title}
              </Link>
              {${n.single}.description && (
                <p className="truncate text-sm text-muted-foreground">{${n.single}.description}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.pending}
              onClick={() => remove.run({ id: ${n.single}.id })}
            >
              {t('Delete')}
            </Button>
          </li>
        ))}
      </ul>

      {${n.plural}.pages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {${n.plural}.page} of {${n.plural}.pages}
          </span>
          <div className="flex gap-2">
            {${n.plural}.page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/${n.module}" data={link(${n.plural}.page - 1)}>{t('Previous')}</Link>
              </Button>
            )}
            {${n.plural}.page < ${n.plural}.pages && (
              <Button asChild variant="outline" size="sm">
                <Link href="/${n.module}" data={link(${n.plural}.page + 1)}>{t('Next')}</Link>
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
`
}

function showPage(n: Names) {
  return `import { db, type LoadContext } from '@zeyadshalaby1/masar'
import { Link, router, useAction, useT, type PageProps } from '@zeyadshalaby1/masar/react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { delete${n.Single}, get${n.Single}, update${n.Single} } from '../../actions'
import { ${n.plural} } from '../../schema'
import { ${n.Single}Form } from '../components/${n.Single}Form'

// views/pages/[id].tsx answers /${n.module}/:id
export const meta = ({ ${n.single} }: PageProps<typeof load>) => ({ title: ${n.single}.title, description: ${n.single}.description ?? undefined })

/** Which /${n.module}/:id pages go in sitemap.xml. Server only, like load(). */
export async function sitemap() {
  return (await db(${n.plural}).latest().limit(5000).all()).map((${n.single}) => ({ id: ${n.single}.id }))
}

export async function load({ params }: LoadContext<{ id: string }>) {
  return { ${n.single}: await get${n.Single}({ id: params.id }) }
}

export default function ${n.Single}Show({ ${n.single} }: PageProps<typeof load>) {
  const t = useT()
  const update = useAction(update${n.Single}, { reload: true })
  const remove = useAction(delete${n.Single}, { onSuccess: () => router.visit('/${n.module}') })

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div className="space-y-2">
        <Link href="/${n.module}" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('${n.title}')}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{${n.single}.title}</h1>
        <p className="text-sm text-muted-foreground">{t('Created {date}', { date: new Date(${n.single}.createdAt).toLocaleString() })}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Edit')}</CardTitle>
        </CardHeader>
        <CardContent>
          <${n.Single}Form
            defaultValues={${n.single}}
            submitLabel={t('Save changes')}
            pending={update.pending}
            errors={update.errors}
            error={update.error}
            onSubmit={(values) => update.run({ id: ${n.single}.id, ...values })}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-destructive/30 p-4">
        <p className="text-sm">{t('Delete this ${n.singularTitle} permanently.')}</p>
        <Button variant="destructive" size="sm" disabled={remove.pending} onClick={() => remove.run({ id: ${n.single}.id })}>
          {t('Delete')}
        </Button>
      </div>
    </div>
  )
}
`
}

function basicPage(n: Names) {
  return `import { useState } from 'react'
import { useAction, type PageProps } from '@zeyadshalaby1/masar/react'
import { Button } from '@/shared/ui/button'
import { greet } from '../../actions'

export async function load() {
  return { greeting: await greet() }
}

export default function ${n.Plural}Index({ greeting }: PageProps<typeof load>) {
  const hello = useAction(greet)
  const [reply, setReply] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">${n.title}</h1>
      <p className="text-muted-foreground">{greeting.message}</p>
      <Button
        disabled={hello.pending}
        onClick={async () => setReply((await hello.run({ name: 'the browser' }))?.message ?? null)}
      >
        Call the action from the browser
      </Button>
      {reply && <p className="text-sm">{reply}</p>}
    </div>
  )
}
`
}

function seedsFile(n: Names) {
  return `import { db, defineSeed } from '@zeyadshalaby1/masar'
import { ${n.plural} } from './schema'

// masar db:seed fills this module with test data (masar db:seed --fresh empties the tables first).
export default defineSeed(async ({ fake }) => {
  await db(${n.plural}).createMany(
    fake.many(20, () => ({
      title: fake.title(fake.boolean() ? 'ar' : 'en'),
      description: fake.boolean(0.7) ? fake.paragraph(2) : null,
    })),
  )
})
`
}

/** Files for a new module, keyed by path relative to src/modules/<name>. */
export function moduleFiles(raw: string, options: ModuleOptions): Record<string, string> {
  const n = names(raw)
  const files: Record<string, string> = {
    'module.ts': moduleFile(n, options),
    'routes.ts': routesFile(n, options),
    'jobs/.gitkeep': '',
  }
  if (options.crud) {
    files['schema.ts'] = schemaFile(n)
    files['actions.ts'] = crudActions(n)
    files['seeds.ts'] = seedsFile(n)
  } else {
    files['actions.ts'] = basicActions(n)
  }
  if (options.ui) {
    if (options.crud) {
      files['views/pages/index.tsx'] = indexPage(n)
      files['views/pages/[id].tsx'] = showPage(n)
      files[`views/components/${n.Single}Form.tsx`] = formComponent(n)
    } else {
      files['views/pages/index.tsx'] = basicPage(n)
      files['views/components/.gitkeep'] = ''
    }
  }
  return files
}
