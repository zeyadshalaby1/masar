import { Link, router, usePage } from '@inertiajs/react'
import { useEffect, useMemo, useState } from 'react'
import type { UploadedFile } from '../../client/runtime'
import type { AdminField, AdminList, AdminResource, AdminRow } from '../types'
import { FilePreview } from './inputs'
import { adminCall, Badge, Button, Card, cx, Icon, inputClass, Skeleton, TextInput, useAdminData, useAdminT, useConfirm, useDebounced, useFormat, useToast } from './kit'
import { AdminPage } from './layout'

export function Cell({ field, row, prefix }: { field: AdminField; row: AdminRow; prefix: string }) {
  const t = useAdminT()
  const format = useFormat()
  const value = row[field.name]
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>
  switch (field.input) {
    case 'switch':
      return value ? <Badge tone="success">{t('Yes')}</Badge> : <Badge>{t('No')}</Badge>
    case 'select':
    case 'radio':
      return <Badge tone="brand">{field.options?.find((o) => o.value === value)?.label ?? String(value)}</Badge>
    case 'date':
    case 'datetime':
      return <span className="whitespace-nowrap text-muted-foreground">{format.date(value)}</span>
    case 'number':
      return <span className="tabular-nums">{format.number(value)}</span>
    case 'ref':
      return (
        <Link href={`${prefix}/${field.ref}/${String(value)}`} className="text-brand-ink hover:underline">
          {row.__refs?.[field.name] ?? String(value)}
        </Link>
      )
    case 'file':
      return <FilePreview file={value as UploadedFile} className="size-10 rounded-md border" />
    case 'files':
      return <span className="text-muted-foreground">{(value as unknown[]).length}</span>
    case 'color':
      return (
        <span className="inline-flex items-center gap-2 font-mono text-xs">
          <span className="size-4 rounded border" style={{ background: String(value) }} />
          {String(value)}
        </span>
      )
    case 'json':
    case 'tags':
      return <span className="font-mono text-xs text-muted-foreground">{JSON.stringify(value).slice(0, 60)}</span>
    default:
      return <span className="line-clamp-2 max-w-xs">{String(value)}</span>
  }
}

function Filters({ resource, filters, setFilters }: { resource: AdminResource; filters: Record<string, unknown>; setFilters: (f: Record<string, unknown>) => void }) {
  const t = useAdminT()
  const fields = resource.fields.filter((f) => resource.filters.includes(f.name))
  const [refOptions, setRefOptions] = useState<Record<string, { value: string; label: string }[]>>({})
  useEffect(() => {
    for (const f of fields.filter((x) => x.input === 'ref')) {
      adminCall<{ value: string; label: string }[]>('options', { resource: f.ref }).then((o) => setRefOptions((all) => ({ ...all, [f.name]: o })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.name])
  const set = (name: string, value: unknown) => setFilters({ ...filters, [name]: value })
  return (
    <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map((f) => (
        <label key={f.name} className="space-y-1.5 text-sm">
          <span className="font-medium">{f.label}</span>
          {f.input === 'switch' ? (
            <select className={cx(inputClass, 'h-9')} value={String(filters[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value || undefined)}>
              <option value="">{t('All')}</option>
              <option value="true">{t('Yes')}</option>
              <option value="false">{t('No')}</option>
            </select>
          ) : f.input === 'datetime' || f.input === 'date' ? (
            <div className="flex gap-2">
              {(['from', 'to'] as const).map((edge) => (
                <input
                  key={edge}
                  type="date"
                  aria-label={t(edge === 'from' ? 'From' : 'To')}
                  className={cx(inputClass, 'h-9')}
                  value={String((filters[f.name] as Record<string, string> | undefined)?.[edge] ?? '')}
                  onChange={(e) => set(f.name, { ...(filters[f.name] as object), [edge]: e.target.value || undefined })}
                />
              ))}
            </div>
          ) : (
            <select className={cx(inputClass, 'h-9')} value={String(filters[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value || undefined)}>
              <option value="">{t('All')}</option>
              {(f.options ?? refOptions[f.name] ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}
    </div>
  )
}

/** The table of one resource. `parent` limits it to children of a record (used on record pages). */
export function ResourceTable({ resource, parent, compact }: { resource: AdminResource; parent?: { field: string; id: string }; compact?: boolean }) {
  const t = useAdminT()
  const toast = useToast()
  const confirm = useConfirm()
  const prefix = usePage<{ masar: { admin: { prefix: string } } }>().props.masar.admin.prefix
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(compact ? 5 : resource.perPage)
  const [sort, setSort] = useState<[string, 'asc' | 'desc']>(resource.sort)
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const search = useDebounced(q)
  const body = { resource: resource.name, page, perPage, q: search, sort: sort[0], dir: sort[1], filters, parent }
  const { data, loading, error, reload } = useAdminData<AdminList>('list', body, [resource.name, page, perPage, search, sort.join(), JSON.stringify(filters), parent?.id])
  useEffect(() => setPage(1), [search, JSON.stringify(filters)])
  useEffect(() => setSelected(new Set()), [data])

  const columns = useMemo(() => resource.columns.map((c) => resource.fields.find((f) => f.name === c)!).filter(Boolean), [resource])
  const rows = data?.data ?? []
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const activeFilters = Object.values(filters).filter((v) => v !== undefined && v !== '').length

  const remove = async (ids: string[]) => {
    const ok = await confirm({ title: ids.length === 1 ? t('Delete this record?') : t('Delete {count} records?', { count: ids.length }), body: t('This cannot be undone.'), confirm: t('Delete'), destructive: true })
    if (!ok) return
    setBusy(true)
    try {
      await adminCall('delete', { resource: resource.name, ids })
      toast(t('Deleted'))
      reload()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const runAction = async (name: string, ids: string[]) => {
    const action = resource.actions.find((a) => a.name === name)!
    if (action.confirm && !(await confirm({ title: action.label, body: action.confirm, destructive: action.variant === 'destructive' }))) return
    setBusy(true)
    try {
      await adminCall('run', { resource: resource.name, action: name, ids })
      toast(t('Ran {name}', { name: action.label }))
      reload()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = async () => {
    const csv = await adminCall<string>('export', { ...body, page: undefined })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `${resource.name}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const toggleSort = (name: string) => setSort(([field, dir]) => [name, field === name && dir === 'asc' ? 'desc' : 'asc'])
  const href = (row: AdminRow) => `${prefix}/${resource.name}/${row.id}`

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        {resource.searchable && (
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search…')} className="ps-9" aria-label={t('Search')} />
          </div>
        )}
        {resource.filters.length > 0 && !parent && (
          <Button icon="list-filter" onClick={() => setShowFilters((s) => !s)} variant={showFilters || activeFilters ? 'subtle' : 'outline'}>
            {t('Filters')}
            {activeFilters > 0 && <Badge tone="brand">{activeFilters}</Badge>}
          </Button>
        )}
        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
            {t('Clear filters')}
          </Button>
        )}
        <div className="ms-auto flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">{t('{count} selected', { count: selected.size })}</span>
              {resource.actions
                .filter((a) => a.bulk)
                .map((a) => (
                  <Button key={a.name} size="sm" icon={a.icon} disabled={busy} onClick={() => runAction(a.name, [...selected])} variant={a.variant === 'destructive' ? 'destructive' : 'outline'}>
                    {a.label}
                  </Button>
                ))}
              {resource.can.delete && (
                <Button size="sm" variant="destructive" icon="trash-2" disabled={busy} onClick={() => remove([...selected])}>
                  {t('Delete')}
                </Button>
              )}
            </>
          )}
          {resource.can.export && !compact && selected.size === 0 && (
            <Button size="sm" variant="ghost" icon="download" onClick={exportCsv}>
              {t('Export')}
            </Button>
          )}
        </div>
      </div>
      {showFilters && <Filters resource={resource} filters={filters} setFilters={setFilters} />}

      {/* relative: keeps absolutely positioned bits (sr-only labels) inside the scroll box on phones */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {(resource.can.delete || resource.actions.some((a) => a.bulk)) && (
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" aria-label={t('Select all')} checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} className="size-4 accent-[var(--primary)]" />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.name} className="px-4 py-2.5 text-start font-medium whitespace-nowrap">
                  {c.sortable ? (
                    <button type="button" onClick={() => toggleSort(c.name)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.label}
                      <Icon name={sort[0] === c.name ? (sort[1] === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'} className={cx('size-3', sort[0] !== c.name && 'opacity-40')} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th className="w-px px-4 py-2.5">
                <span className="sr-only">{t('Actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && !data &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={columns.length + 2} className="px-4 py-3">
                    <Skeleton className="h-5" />
                  </td>
                </tr>
              ))}
            {rows.map((row) => (
              <tr key={row.id} className={cx('transition-colors hover:bg-muted/40', selected.has(row.id) && 'bg-accent/50')}>
                {(resource.can.delete || resource.actions.some((a) => a.bulk)) && (
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={row.__title}
                      checked={selected.has(row.id)}
                      onChange={() => setSelected((s) => (s.has(row.id) ? new Set([...s].filter((x) => x !== row.id)) : new Set([...s, row.id])))}
                      className="size-4 accent-[var(--primary)]"
                    />
                  </td>
                )}
                {columns.map((c, i) => (
                  <td key={c.name} className="px-4 py-2.5 align-middle">
                    {i === 0 && c.input !== 'file' ? (
                      <Link href={href(row)} className="font-medium hover:underline">
                        <Cell field={c} row={row} prefix={prefix} />
                      </Link>
                    ) : (
                      <Cell field={c} row={row} prefix={prefix} />
                    )}
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    {resource.actions
                      .filter((a) => !a.bulk)
                      .map((a) => (
                        <Button key={a.name} size="icon" variant="ghost" title={a.label} aria-label={a.label} disabled={busy} onClick={() => runAction(a.name, [row.id])}>
                          <Icon name={a.icon ?? 'play'} />
                        </Button>
                      ))}
                    <Button size="icon" variant="ghost" title={t('Edit')} aria-label={t('Edit')} onClick={() => router.visit(href(row))}>
                      <Icon name="pencil" />
                    </Button>
                    {resource.can.delete && (
                      <Button size="icon" variant="ghost" title={t('Delete')} aria-label={t('Delete')} disabled={busy} onClick={() => remove([row.id])}>
                        <Icon name="trash-2" className="text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="p-6 text-sm text-destructive">{error}</p>}
        {data && rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-muted">
              <Icon name={resource.icon} className="size-5 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">{search || activeFilters ? t('No results for your search.') : t('Nothing here yet.')}</p>
            {resource.can.create && !search && !activeFilters && !parent && (
              <Button variant="primary" icon="plus" onClick={() => router.visit(`${prefix}/${resource.name}/new`)}>
                {t('Create the first one')}
              </Button>
            )}
          </div>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">{t('{count} records', { count: data.total })}</span>
          <div className="flex items-center gap-2">
            {!compact && (
              <select className="h-8 rounded-md border border-input bg-background px-2" value={perPage} onChange={(e) => (setPerPage(Number(e.target.value)), setPage(1))} aria-label={t('Rows per page')}>
                {[10, 20, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            )}
            <span className="text-muted-foreground">{t('Page {page} of {pages}', { page: data.page, pages: data.pages })}</span>
            <Button size="icon" variant="ghost" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label={t('Previous')}>
              <Icon name="chevron-left" className="rtl:rotate-180" />
            </Button>
            <Button size="icon" variant="ghost" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label={t('Next')}>
              <Icon name="chevron-right" className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export function useResourceFromUrl(): { resource: AdminResource | undefined; id?: string; isNew: boolean } {
  const page = usePage<{ masar: { admin: { prefix: string; resources: Record<string, AdminResource> } } }>()
  const { prefix, resources } = page.props.masar.admin
  const [name, id] = page.url.split('?')[0]!.slice(prefix.length + 1).split('/')
  return { resource: resources[name ?? ''], id: id === 'new' ? undefined : id, isNew: id === 'new' }
}

/** src/modules/admin/views/pages/[resource]/index.tsx */
export function ResourceIndexPage() {
  const t = useAdminT()
  const { resource } = useResourceFromUrl()
  const prefix = usePage<{ masar: { admin: { prefix: string } } }>().props.masar.admin.prefix
  if (!resource) return <AdminPage title={t('Not found')} />
  return (
    <AdminPage
      title={resource.label}
      icon={resource.icon}
      actions={
        resource.can.create && (
          <Button variant="primary" icon="plus" onClick={() => router.visit(`${prefix}/${resource.name}/new`)}>
            {t('New {name}', { name: resource.singular })}
          </Button>
        )
      }
    >
      <ResourceTable key={resource.name} resource={resource} />
    </AdminPage>
  )
}
