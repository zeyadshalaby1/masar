import type { z } from 'zod'
import type { Action } from '../actions/action'
import type { Model, RowOf } from '../db/model'

/** Input widgets the admin forms know. Picked from the field type unless you choose one. */
export type InputKind =
  | 'text'
  | 'textarea'
  | 'markdown'
  | 'email'
  | 'url'
  | 'password'
  | 'color'
  | 'slug'
  | 'number'
  | 'switch'
  | 'select'
  | 'radio'
  | 'date'
  | 'datetime'
  | 'json'
  | 'ref'
  | 'file'
  | 'files'
  | 'tags'

export interface FieldOptions {
  label?: string
  /** One line under the input. */
  help?: string
  placeholder?: string
  input?: InputKind
  /** Shown but not editable. */
  readonly?: boolean
  /** Hide from the table, the form, or both. */
  hidden?: boolean | 'list' | 'form'
  /** Extra validation on top of the schema, e.g. z.string().min(10). */
  rules?: z.ZodType
  /** Options for select/radio on string fields (enum fields have theirs already). */
  options?: readonly string[]
  /** Fill this slug field from another field while typing (input: 'slug'). */
  from?: string
  /** Width in the form grid. */
  span?: 'full' | 'half'
}

export interface ResourceAction {
  label: string
  /** Lucide icon name in kebab-case: 'send', 'archive', 'badge-check'. */
  icon?: string
  /** Called with { id } for a row, or { ids } when `bulk` is true. */
  action: Action<any, any>
  bulk?: boolean
  /** Ask before running. */
  confirm?: string
  variant?: 'default' | 'destructive'
}

export interface ResourceOptions<M extends Model<any, any> = Model> {
  label?: string
  /** Singular label, e.g. "Course". */
  singular?: string
  /** Lucide icon name in kebab-case: 'book-open', 'image', 'users'. */
  icon?: string
  /** Sidebar group, e.g. "Content". */
  group?: string
  order?: number
  hidden?: boolean
  /** Field shown as the record's name (in titles, ref selects, breadcrumbs). */
  titleField?: keyof RowOf<M> & string
  /** Table columns, in order. Defaults to the first fields of the schema. */
  columns?: (keyof RowOf<M> & string)[]
  /** Fields the search box looks in. Defaults to text fields. */
  search?: (keyof RowOf<M> & string)[]
  /** Fields offered as filters. Defaults to enums, booleans, refs and dates. */
  filters?: (keyof RowOf<M> & string)[]
  /** Form fields in order; nest an array for a section: [['title', 'slug'], 'body']. */
  form?: ((keyof RowOf<M> & string) | { title: string; fields: (keyof RowOf<M> & string)[] })[]
  fields?: { [K in keyof RowOf<M> & string]?: FieldOptions }
  perPage?: number
  sort?: [keyof RowOf<M> & string, 'asc' | 'desc']
  can?: { create?: boolean; update?: boolean; delete?: boolean; export?: boolean }
  actions?: Record<string, ResourceAction>
}

export interface ResourceDefinition {
  readonly __masar: 'resource'
  model: Model
  options: ResourceOptions<any>
}

/**
 * Customize how a model shows in the admin, in src/modules/admin/resources/<name>.ts:
 *
 *   export default defineResource(courses, {
 *     icon: 'book-open',
 *     columns: ['cover', 'title', 'level', 'published'],
 *     fields: { body: { input: 'markdown' }, slug: { input: 'slug', from: 'title' } },
 *     actions: { publish: { label: 'Publish', icon: 'send', action: publishCourses, bulk: true } },
 *   })
 *
 * Models without a resource file still appear, with defaults from their schema.
 */
export function defineResource<M extends Model<any, any>>(model: M, options: ResourceOptions<M> = {}): ResourceDefinition {
  return { __masar: 'resource', model, options }
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export type Widget =
  | { kind: 'stat'; label: string; icon?: string; value: () => Promise<number | string>; hint?: () => Promise<string>; href?: string }
  | { kind: 'chart'; label: string; type: 'bar' | 'line'; data: () => Promise<{ label: string; value: number }[]>; span?: 'full' | 'half' }
  | { kind: 'latest'; label?: string; resource: string; limit?: number; span?: 'full' | 'half' }
  | { kind: 'banner'; title: string; body?: string; tone?: 'brand' | 'info' | 'warning'; href?: string; cta?: string }

export const widgets = {
  /** A number with a label: stat('Students', () => db(users).count(), { icon: 'users' }) */
  stat: (label: string, value: () => Promise<number | string>, options: { icon?: string; hint?: () => Promise<string>; href?: string } = {}): Widget => ({
    kind: 'stat',
    label,
    value,
    ...options,
  }),
  /** Bars or a line from { label, value } points. */
  chart: (label: string, data: () => Promise<{ label: string; value: number }[]>, options: { type?: 'bar' | 'line'; span?: 'full' | 'half' } = {}): Widget => ({
    kind: 'chart',
    label,
    type: options.type ?? 'bar',
    data,
    span: options.span,
  }),
  /** The newest rows of a resource. */
  latest: (resource: string, options: { label?: string; limit?: number; span?: 'full' | 'half' } = {}): Widget => ({ kind: 'latest', resource, ...options }),
  /** A message across the dashboard, with an optional link. */
  banner: (title: string, options: { body?: string; tone?: 'brand' | 'info' | 'warning'; href?: string; cta?: string } = {}): Widget => ({
    kind: 'banner',
    title,
    ...options,
  }),
}

export interface DashboardDefinition {
  readonly __masar: 'dashboard'
  widgets: Widget[]
}

/** src/modules/admin/dashboard.ts: export default defineDashboard([widgets.stat(...), widgets.chart(...)]) */
export function defineDashboard(list: Widget[]): DashboardDefinition {
  return { __masar: 'dashboard', widgets: list }
}

/** `export const admin = { title, icon }` in a page of the admin module puts it in the sidebar. */
export interface AdminPageMeta {
  title: string
  icon?: string
  group?: string
  order?: number
}
