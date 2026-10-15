import { z } from 'zod'
import { auth, users } from '../auth'
import { db } from '../db/db'
import { allFields, type Field, type Model } from '../db/model'
import type { Query } from '../db/query'
import { MasarError, NotFoundError, ValidationError } from '../errors'
import { currentLocale, messagesFor } from '../i18n'
import { translate, type Params } from '../i18n/shared'
import { isIssued, parseSize } from '../storage'
import type { AdminPageMeta, DashboardDefinition, FieldOptions, InputKind, ResourceDefinition, Widget } from './define'
import { ADMIN_AR } from './messages'
import type { AdminField, AdminList, AdminNavItem, AdminResource, AdminRow, AdminShared } from './types'

type AnyField = Field<any, boolean, boolean, any>

/** "createdAt" → "Created at", "blog_posts" → "Blog posts" */
export function humanize(name: string): string {
  const words = name.replace(/Id$/, '').replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function singularize(word: string): string {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y')
  if (/(ss|sh|ch|x)es$/i.test(word)) return word.replace(/es$/i, '')
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word.slice(0, -1)
  return word
}

/** Admin texts: the app's translation first, then the admin's own Arabic, then the key. */
export function adminT(key: string, params?: Params): string {
  const locale = currentLocale()
  const app = messagesFor(locale)
  const own = locale.startsWith('ar') ? ADMIN_AR : {}
  return translate({ ...own, ...Object.fromEntries(Object.entries(app).filter(([, v]) => v)) }, key, params)
}

function inputFor(name: string, field: AnyField): InputKind {
  if (field.meta.file) return field.meta.file.many ? 'files' : 'file'
  if (field.kind === 'ref') return 'ref'
  if (field.meta.values) return 'select'
  switch (field.kind) {
    case 'text':
      return 'textarea'
    case 'number':
    case 'int':
      return 'number'
    case 'boolean':
      return 'switch'
    case 'date':
      return 'datetime'
    case 'json':
      return 'json'
  }
  const lower = name.toLowerCase()
  if (lower.includes('email')) return 'email'
  if (/(url|link|website)$/.test(lower)) return 'url'
  if (/colou?r$/.test(lower)) return 'color'
  if (lower === 'slug') return 'slug'
  return 'text'
}

const SYSTEM = new Set(['id', 'createdAt', 'updatedAt'])
const TITLE_CANDIDATES = ['title', 'name', 'label', 'email', 'slug', 'code']

interface Resource {
  meta: AdminResource
  model: Model
  definition?: ResourceDefinition
  fieldOptions: Record<string, FieldOptions>
}

export interface AdminInput {
  prefix: string
  models: Model[]
  resources: Record<string, unknown>
  dashboard: Record<string, unknown>
  /** Custom pages of the admin module: path relative to views/pages → its `admin` export. */
  pages: { relative: string; meta?: AdminPageMeta }[]
}

export function createAdmin(input: AdminInput) {
  const definitions = new Map<string, ResourceDefinition>()
  for (const [path, mod] of Object.entries(input.resources)) {
    const definition = (mod as { default?: ResourceDefinition }).default
    if (definition?.__masar !== 'resource') {
      throw new MasarError(`${path.replace(/^.*src\//, 'src/')} must export default defineResource(model, { ... })`, {
        hint: "import { defineResource } from 'masar', then export default defineResource(courses, { icon: 'book-open' })",
      })
    }
    definitions.set(definition.model.table, definition)
  }
  const dashboardDefinition = (Object.values(input.dashboard)[0] as { default?: DashboardDefinition } | undefined)?.default

  const managed = input.models.filter((m) => m.table !== 'sessions')

  /** Build resource metadata in the current request's language. */
  function build(model: Model): Resource {
    const definition = definitions.get(model.table)
    const o = definition?.options ?? {}
    const fieldOptions = (o.fields ?? {}) as Record<string, FieldOptions>
    const isUsers = model === (users as Model)
    const names = Object.keys(allFields(model)).filter((n) => n !== 'id' && n !== 'passwordHash')
    const fields: AdminField[] = names.map((name) => {
      const field = allFields(model)[name]!
      const fo = fieldOptions[name] ?? {}
      const input = fo.input ?? (isUsers && name === 'role' ? 'text' : inputFor(name, field))
      const optional = field.meta.optional || 'default' in field.meta || field.kind === 'boolean'
      const values = fo.options ?? field.meta.values
      const hidden = fo.hidden
      return {
        name,
        label: adminT(fo.label ?? humanize(name)),
        input,
        required: !optional && !SYSTEM.has(name),
        readonly: Boolean(fo.readonly) || SYSTEM.has(name),
        list: hidden !== true && hidden !== 'list',
        form: hidden !== true && hidden !== 'form' && !SYSTEM.has(name),
        sortable: !field.meta.file && field.kind !== 'json',
        filter: false,
        options: values?.map((v) => ({ value: v, label: adminT(humanize(v)) })),
        ref: field.kind === 'ref' ? field.meta.ref : undefined,
        file: field.meta.file
          ? { accept: field.meta.file.accept ? [...field.meta.file.accept] : undefined, maxSize: parseSize(field.meta.file.maxSize), many: Boolean(field.meta.file.many) }
          : undefined,
        help: fo.help ? adminT(fo.help) : undefined,
        placeholder: fo.placeholder ? adminT(fo.placeholder) : undefined,
        from: fo.from,
        default: 'default' in field.meta && typeof field.meta.default !== 'function' ? field.meta.default : undefined,
        span: fo.span ?? (input === 'textarea' || input === 'markdown' || input === 'json' || input === 'files' ? 'full' : 'half'),
      }
    })
    if (isUsers) {
      fields.splice(2, 0, {
        name: 'password',
        label: adminT('Password'),
        input: 'password',
        required: false,
        readonly: false,
        list: false,
        form: true,
        sortable: false,
        filter: false,
        help: adminT('Leave empty to keep the current password'),
        span: 'half',
      })
    }
    const byName = new Map(fields.map((f) => [f.name, f]))
    const titleField = o.titleField ?? TITLE_CANDIDATES.find((n) => byName.has(n)) ?? fields.find((f) => f.input === 'text')?.name ?? 'id'
    const defaultColumns = fields
      .filter((f) => f.list && !['textarea', 'markdown', 'json', 'files', 'password'].includes(f.input) && !SYSTEM.has(f.name))
      .slice(0, 5)
      .map((f) => f.name)
    const columns = (o.columns ?? [...defaultColumns, 'createdAt']).filter((c) => byName.has(c))
    const filters = (o.filters ?? fields.filter((f) => ['select', 'switch', 'ref'].includes(f.input) || f.name === 'createdAt').map((f) => f.name)).filter((n) =>
      byName.has(n),
    )
    for (const name of filters) byName.get(name)!.filter = true
    const search = (o.search ?? fields.filter((f) => ['text', 'textarea', 'email', 'slug', 'url', 'markdown'].includes(f.input)).map((f) => f.name).slice(0, 4)).filter(
      (n) => byName.has(n),
    )
    const label = adminT(o.label ?? humanize(model.table))
    const children = managed
      .filter((m) => m !== model)
      .flatMap((m) =>
        Object.entries(m.fields)
          .filter(([, f]) => f.meta.ref === model.table)
          .map(([field]) => ({ resource: m.table, field, label: adminT(humanize(m.table)) })),
      )
    const formOrder = (o.form ?? fields.filter((f) => f.form).map((f) => f.name)) as ({ title: string; fields: string[] } | string)[]
    const meta: AdminResource = {
      name: model.table,
      label,
      singular: adminT(o.singular ?? singularize(humanize(model.table))),
      icon: o.icon ?? (isUsers ? 'users' : 'database'),
      group: o.group ? adminT(o.group) : isUsers ? adminT('Admin') : adminT('Content'),
      titleField,
      fields,
      columns,
      form: formOrder.map((item) => (typeof item === 'string' ? item : { title: adminT(item.title), fields: item.fields })),
      filters,
      searchable: search.length > 0,
      perPage: o.perPage ?? 20,
      sort: (o.sort as [string, 'asc' | 'desc']) ?? ['createdAt', 'desc'],
      can: { create: o.can?.create ?? true, update: o.can?.update ?? true, delete: o.can?.delete ?? true, export: o.can?.export ?? true },
      actions: Object.entries(o.actions ?? {}).map(([name, a]) => ({
        name,
        label: adminT(a.label),
        icon: a.icon,
        bulk: Boolean(a.bulk),
        confirm: a.confirm ? adminT(a.confirm) : undefined,
        variant: a.variant ?? 'default',
      })),
      children,
    }
    return { meta, model, definition, fieldOptions: Object.assign(fieldOptions, { __search: search as never }) }
  }

  const visible = () =>
    managed
      .filter((m) => !definitions.get(m.table)?.options.hidden)
      .sort((a, b) => (definitions.get(a.table)?.options.order ?? 100) - (definitions.get(b.table)?.options.order ?? 100) || a.table.localeCompare(b.table))

  function resource(name: unknown): Resource {
    const model = visible().find((m) => m.table === name)
    if (!model) throw new NotFoundError(adminT('Not found'), `No admin resource "${String(name)}". Resources are the app's models.`)
    return build(model)
  }

  /** Sidebar and resource metadata, shared with every admin page. */
  function shared(): AdminShared {
    const resources: Record<string, AdminResource> = {}
    for (const model of visible()) resources[model.table] = build(model).meta
    const pages: AdminNavItem[] = input.pages
      .filter((p) => p.meta)
      .sort((a, b) => (a.meta!.order ?? 100) - (b.meta!.order ?? 100))
      .map((p) => ({ title: adminT(p.meta!.title), icon: p.meta!.icon ?? 'file', group: p.meta!.group ? adminT(p.meta!.group) : adminT('Pages'), href: `${input.prefix}/${p.relative.replace(/(^|\/)index$/, '')}`.replace(/\/$/, '') }))
    const nav: AdminNavItem[] = [
      { title: adminT('Dashboard'), href: input.prefix, icon: 'layout-dashboard' },
      ...Object.values(resources).map((r) => ({ title: r.label, href: `${input.prefix}/${r.name}`, icon: r.icon, group: r.group })),
      ...pages,
    ]
    return { prefix: input.prefix, nav, resources }
  }

  // ── Reading ───────────────────────────────────────────────────────────────
  async function decorate(r: Resource, rows: Record<string, unknown>[]): Promise<AdminRow[]> {
    const refs = r.meta.fields.filter((f) => f.ref)
    const labels = new Map<string, Map<string, string>>()
    for (const f of refs) {
      const target = managed.find((m) => m.table === f.ref)
      if (!target) continue
      const ids = [...new Set(rows.map((row) => row[f.name]).filter((v): v is string => typeof v === 'string'))]
      if (!ids.length) continue
      const targetTitle = build(target).meta.titleField
      const found = await db(target).where({ id: { in: ids } } as never).all()
      labels.set(f.name, new Map(found.map((row) => [String(row.id), String((row as Record<string, unknown>)[targetTitle] ?? row.id)])))
    }
    return rows.map((row) => ({
      ...(r.model === (users as Model) ? { ...row, passwordHash: undefined } : row),
      id: String(row.id),
      __title: String(row[r.meta.titleField] ?? row.id),
      __refs: Object.fromEntries(refs.map((f) => [f.name, labels.get(f.name)?.get(String(row[f.name])) ?? null])),
    }))
  }

  type ListInput = { resource: string; page?: number; perPage?: number; q?: string; sort?: string; dir?: 'asc' | 'desc'; filters?: Record<string, unknown>; parent?: { field: string; id: string } }

  function query(r: Resource, body: ListInput): Query<any, any, any> {
    let q: Query<any, any, any> = db(r.model)
    const search = (r.fieldOptions as unknown as { __search: string[] }).__search
    if (body.q?.trim() && search.length) q = q.whereAny(search.map((f) => ({ [f]: { contains: body.q!.trim() } })))
    if (body.parent && r.meta.fields.some((f) => f.name === body.parent!.field)) q = q.where({ [body.parent.field]: body.parent.id })
    for (const [name, value] of Object.entries(body.filters ?? {})) {
      const field = r.meta.fields.find((f) => f.name === name && f.filter)
      if (!field || value === undefined || value === null || value === '') continue
      if (field.input === 'switch') q = q.where({ [name]: value === true || value === 'true' })
      else if (field.input === 'datetime' || field.input === 'date') {
        const range = value as { from?: string; to?: string }
        if (range.from) q = q.where({ [name]: { gte: new Date(range.from).toISOString() } })
        if (range.to) q = q.where({ [name]: { lte: new Date(`${range.to}T23:59:59.999Z`).toISOString() } })
      } else q = q.where({ [name]: Array.isArray(value) ? { in: value } : value })
    }
    const sortField = body.sort && r.meta.fields.some((f) => f.name === body.sort && f.sortable) ? body.sort : r.meta.sort[0]
    return q.orderBy(sortField as never, body.dir ?? (body.sort ? 'asc' : r.meta.sort[1]))
  }

  async function list(body: ListInput): Promise<AdminList> {
    const r = resource(body.resource)
    const result = await query(r, body).paginate(Number(body.page) || 1, Math.min(Number(body.perPage) || r.meta.perPage, 200))
    return { ...result, data: await decorate(r, result.data as Record<string, unknown>[]) }
  }

  async function record(body: { resource: string; id: string }) {
    const r = resource(body.resource)
    const row = await db(r.model).find(body.id)
    if (!row) throw new NotFoundError(adminT('Not found'))
    return (await decorate(r, [row as Record<string, unknown>]))[0]!
  }

  async function options(body: { resource: string; q?: string; ids?: string[] }) {
    const r = resource(body.resource)
    let q: Query<any, any, any> = db(r.model)
    if (body.ids?.length) q = q.where({ id: { in: body.ids } })
    else if (body.q?.trim()) {
      const fields = [r.meta.titleField, ...((r.fieldOptions as unknown as { __search: string[] }).__search ?? [])].filter((f) => f !== 'id')
      if (fields.length) q = q.whereAny([...new Set(fields)].map((f) => ({ [f]: { contains: body.q!.trim() } })))
    }
    const rows = await q.orderBy(r.meta.sort[0] as never, r.meta.sort[1]).limit(20).all()
    return rows.map((row: Record<string, unknown>) => ({ value: String(row.id), label: String(row[r.meta.titleField] ?? row.id) }))
  }

  // ── Writing ───────────────────────────────────────────────────────────────
  async function validate(r: Resource, values: Record<string, unknown>, id?: string) {
    const errors: Record<string, string[]> = {}
    const data: Record<string, unknown> = {}
    const fail = (name: string, message: string) => (errors[name] ??= []).push(message)
    for (const field of r.meta.fields) {
      // Updates may be partial; a new record must answer every required field.
      if (!field.form || field.readonly || (id && !(field.name in values))) continue
      let value = values[field.name]
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0 && field.input !== 'files')
      if (field.input === 'password') {
        if (!empty) data.passwordHash = await auth.hashPassword(String(value))
        else if (!id) fail(field.name, adminT('This field is required'))
        continue
      }
      if (empty) {
        const schemaField = allFields(r.model)[field.name]!
        if (field.required && field.input !== 'files') fail(field.name, adminT('This field is required'))
        // Fields with a default but no .optional() cannot hold null: let the default apply (or keep the value).
        else if ('default' in schemaField.meta && !schemaField.meta.optional) continue
        else data[field.name] = field.input === 'files' ? [] : field.input === 'switch' ? false : null
        continue
      }
      switch (field.input) {
        case 'number': {
          const n = Number(value)
          const kind = allFields(r.model)[field.name]!.kind
          if (!Number.isFinite(n)) fail(field.name, adminT('Enter a number'))
          else if (kind === 'int' && !Number.isInteger(n)) fail(field.name, adminT('Enter a whole number'))
          else value = n
          break
        }
        case 'switch':
          value = value === true || value === 'true' || value === 1
          break
        case 'email':
          if (!z.email().safeParse(String(value).trim()).success) fail(field.name, adminT('Enter a valid email'))
          value = String(value).trim().toLowerCase()
          break
        case 'url':
          if (!z.url().safeParse(String(value).trim()).success) fail(field.name, adminT('Enter a valid URL'))
          value = String(value).trim()
          break
        case 'date':
        case 'datetime':
          if (Number.isNaN(new Date(String(value)).getTime())) fail(field.name, adminT('Pick a valid date'))
          else value = new Date(String(value)).toISOString()
          break
        case 'select':
        case 'radio':
          if (field.options && !field.options.some((o) => o.value === value)) fail(field.name, adminT('Pick one of the options'))
          break
        case 'json':
          if (typeof value === 'string') {
            try {
              value = JSON.parse(value)
            } catch {
              fail(field.name, adminT('Invalid JSON'))
            }
          }
          break
        case 'ref': {
          const target = managed.find((m) => m.table === field.ref)
          if (target && !(await db(target).find(String(value)))) fail(field.name, adminT('Not found'))
          break
        }
        case 'file':
        case 'files':
          for (const file of Array.isArray(value) ? value : [value]) if (!isIssued(file)) fail(field.name, adminT('Something went wrong'))
          break
        default:
          if (typeof value === 'string') value = value.trim()
      }
      const extra = r.fieldOptions[field.name]?.rules
      if (extra) {
        const result = await extra.safeParseAsync(value)
        if (!result.success) for (const issue of result.error.issues) fail(field.name, adminT(issue.message))
        else value = result.data
      }
      const meta = allFields(r.model)[field.name]?.meta
      if (meta?.unique && !errors[field.name]) {
        const taken = await db(r.model).where({ [field.name]: value } as never).first()
        if (taken && String(taken.id) !== id) fail(field.name, adminT('Already taken'))
      }
      data[field.name] = value
    }
    if (Object.keys(errors).length) throw new ValidationError(errors, adminT('Fix the highlighted fields'))
    return data
  }

  async function save(body: { resource: string; id?: string; values: Record<string, unknown> }) {
    const r = resource(body.resource)
    if (body.id ? !r.meta.can.update : !r.meta.can.create) throw new MasarError('Not allowed', { status: 403 })
    const data = await validate(r, body.values ?? {}, body.id)
    const row = body.id ? await db(r.model).update(body.id, data as never) : await db(r.model).create(data as never)
    return (await decorate(r, [row as Record<string, unknown>]))[0]!
  }

  async function remove(body: { resource: string; ids: string[] }) {
    const r = resource(body.resource)
    if (!r.meta.can.delete) throw new MasarError('Not allowed', { status: 403 })
    let count = 0
    for (const id of body.ids ?? []) if (await db(r.model).delete(String(id))) count++
    return { deleted: count }
  }

  async function run(body: { resource: string; action: string; ids: string[] }) {
    const r = resource(body.resource)
    const definition = r.definition?.options.actions?.[body.action]
    if (!definition) throw new NotFoundError(`No action "${body.action}" on ${r.meta.name}`)
    const ids = (body.ids ?? []).map(String)
    const fn = definition.action as unknown as (input: unknown) => Promise<unknown>
    const result = definition.bulk ? await fn({ ids }) : await fn({ id: ids[0] })
    return { result: result ?? null }
  }

  async function exportCsv(body: ListInput): Promise<string> {
    const r = resource(body.resource)
    if (!r.meta.can.export) throw new MasarError('Not allowed', { status: 403 })
    const rows = await decorate(r, (await query(r, body).limit(10_000).all()) as Record<string, unknown>[])
    const fields = r.meta.fields.filter((f) => f.list && f.input !== 'password')
    const cell = (v: unknown) => {
      const text = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify((v as { url?: string }).url ?? v) : String(v)
      // Leading = + - @ would run as a formula in spreadsheets.
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
    }
    const lines = [['id', ...fields.map((f) => f.label)].map(cell).join(',')]
    for (const row of rows) lines.push([row.id, ...fields.map((f) => (f.ref ? (row.__refs?.[f.name] ?? row[f.name]) : row[f.name]))].map(cell).join(','))
    return `﻿${lines.join('\n')}\n`
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  async function dashboard() {
    const items: Widget[] =
      dashboardDefinition?.widgets ??
      [
        ...visible()
          .slice(0, 4)
          .map((m): Widget => ({ kind: 'stat', label: build(m).meta.label, icon: build(m).meta.icon, value: () => db(m).count(), href: `${input.prefix}/${m.table}` })),
        ...visible()
          .filter((m) => m !== (users as Model))
          .slice(0, 2)
          .map((m): Widget => ({ kind: 'latest', resource: m.table, limit: 5 })),
      ]
    return Promise.all(
      items.map(async (w) => {
        switch (w.kind) {
          case 'stat':
            return { kind: w.kind, label: adminT(w.label), icon: w.icon, href: w.href, value: await w.value(), hint: w.hint ? await w.hint() : undefined }
          case 'chart':
            return { kind: w.kind, label: adminT(w.label), type: w.type, span: w.span, data: await w.data() }
          case 'latest': {
            const r = resource(w.resource)
            const rows = await list({ resource: w.resource, perPage: w.limit ?? 5 })
            return { kind: w.kind, label: w.label ? adminT(w.label) : r.meta.label, resource: w.resource, span: w.span, rows: rows.data }
          }
          case 'banner':
            return { kind: w.kind, title: adminT(w.title), body: w.body ? adminT(w.body) : undefined, tone: w.tone ?? 'brand', href: w.href, cta: w.cta ? adminT(w.cta) : undefined }
        }
      }),
    )
  }

  /** Keys for the translation files: resource and field labels the scanner cannot see. */
  function labelKeys(): string[] {
    const keys = new Set<string>()
    for (const m of managed) {
      keys.add(humanize(m.table))
      keys.add(singularize(humanize(m.table)))
      for (const [name, field] of Object.entries(m.fields)) {
        if (name === 'passwordHash') continue
        keys.add(humanize(name))
        for (const v of field.meta.values ?? []) keys.add(humanize(v))
      }
    }
    for (const p of input.pages) if (p.meta) (keys.add(p.meta.title), p.meta.group && keys.add(p.meta.group))
    for (const { options: o } of definitions.values()) {
      for (const text of [o.label, o.singular, o.group]) if (text) keys.add(text)
      for (const f of Object.values((o.fields ?? {}) as Record<string, FieldOptions>)) for (const text of [f.label, f.help, f.placeholder]) if (text) keys.add(text)
      for (const a of Object.values(o.actions ?? {})) for (const text of [a.label, a.confirm]) if (text) keys.add(text)
      for (const item of o.form ?? []) if (typeof item === 'object') keys.add(item.title)
    }
    for (const w of dashboardDefinition?.widgets ?? []) {
      for (const text of w.kind === 'banner' ? [w.title, w.body, w.cta] : w.kind === 'latest' ? [w.label] : [w.label]) if (text) keys.add(text)
    }
    return [...keys]
  }

  return { shared, list, record, options, save, remove, run, exportCsv, dashboard, labelKeys }
}

export type AdminEngine = ReturnType<typeof createAdmin>
