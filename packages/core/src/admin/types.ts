/** What the admin UI receives about resources. Plain data, shared by the server and the browser. */
import type { InputKind } from './define'

export interface AdminField {
  name: string
  label: string
  input: InputKind
  required: boolean
  readonly: boolean
  list: boolean
  form: boolean
  sortable: boolean
  filter: boolean
  options?: { value: string; label: string }[]
  /** For ref fields: the resource it points to. */
  ref?: string
  file?: { accept?: string[]; maxSize?: number; many: boolean }
  help?: string
  placeholder?: string
  from?: string
  span: 'full' | 'half'
  /** The schema default, when it is a plain value (prefills new records). */
  default?: unknown
}

export interface AdminResource {
  name: string
  label: string
  singular: string
  icon: string
  group?: string
  titleField: string
  fields: AdminField[]
  columns: string[]
  form: ({ title: string; fields: string[] } | string)[]
  filters: string[]
  searchable: boolean
  perPage: number
  sort: [string, 'asc' | 'desc']
  can: { create: boolean; update: boolean; delete: boolean; export: boolean }
  actions: { name: string; label: string; icon?: string; bulk: boolean; confirm?: string; variant: 'default' | 'destructive' }[]
  /** Resources that point to this one (shown on the record page). */
  children: { resource: string; field: string; label: string }[]
}

export interface AdminNavItem {
  title: string
  href: string
  icon: string
  group?: string
}

export interface AdminShared {
  prefix: string
  nav: AdminNavItem[]
  resources: Record<string, AdminResource>
}

export type AdminRow = Record<string, unknown> & { id: string; __title: string; __refs?: Record<string, string | null> }

export interface AdminList {
  data: AdminRow[]
  total: number
  page: number
  perPage: number
  pages: number
}
