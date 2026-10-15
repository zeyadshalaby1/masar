import { Link } from '@inertiajs/react'
import type { ReactNode } from 'react'
import type { AdminRow } from '../types'
import { Card, cx, Icon, Skeleton, useAdmin, useAdminData, useAdminT, useFormat } from './kit'
import { AdminPage } from './layout'

type WidgetData =
  | { kind: 'stat'; label: string; icon?: string; href?: string; value: number | string; hint?: string }
  | { kind: 'chart'; label: string; type: 'bar' | 'line'; span?: 'full' | 'half'; data: { label: string; value: number }[] }
  | { kind: 'latest'; label: string; resource: string; span?: 'full' | 'half'; rows: AdminRow[] }
  | { kind: 'banner'; title: string; body?: string; tone: 'brand' | 'info' | 'warning'; href?: string; cta?: string }

/** A number card. Use it in custom pages too. */
export function StatCard({ label, value, icon, hint, href }: { label: ReactNode; value: ReactNode; icon?: string; hint?: ReactNode; href?: string }) {
  const body = (
    <Card className="flex items-start justify-between gap-4 p-5 transition hover:border-ring/40">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {icon && (
        <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon name={icon} className="size-5" />
        </span>
      )}
    </Card>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

/** Bars or a line, in SVG: no chart library. */
export function Chart({ data, type = 'bar', height = 180 }: { data: { label: string; value: number }[]; type?: 'bar' | 'line'; height?: number }) {
  const format = useFormat()
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / Math.max(1, data.length)
  const points = data.map((d, i) => `${i * w + w / 2},${100 - (d.value / max) * 92}`).join(' ')
  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" />
        ))}
        {type === 'bar'
          ? data.map((d, i) => (
              <rect key={i} x={i * w + w * 0.18} width={w * 0.64} y={100 - (d.value / max) * 92} height={(d.value / max) * 92} rx="1" className="fill-primary">
                <title>{`${d.label}: ${format.number(d.value)}`}</title>
              </rect>
            ))
          : (
              <>
                <polyline points={`${w / 2},100 ${points} ${100 - w / 2},100`} className="fill-primary/15" stroke="none" />
                <polyline points={points} fill="none" className="stroke-primary" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </>
            )}
      </svg>
      <div className="mt-2 flex text-[11px] text-muted-foreground" dir="ltr">
        {data.map((d, i) => (
          <span key={i} className="truncate text-center" style={{ width: `${w}%` }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function Widget({ widget }: { widget: WidgetData }) {
  const t = useAdminT()
  const admin = useAdmin()
  const format = useFormat()
  switch (widget.kind) {
    case 'stat':
      return <StatCard label={widget.label} value={typeof widget.value === 'number' ? format.number(widget.value) : widget.value} icon={widget.icon} hint={widget.hint} href={widget.href} />
    case 'banner':
      return (
        <div
          className={cx(
            'flex flex-wrap items-center justify-between gap-4 rounded-xl p-5 sm:col-span-2 lg:col-span-4',
            widget.tone === 'brand' ? 'bg-primary text-primary-foreground' : widget.tone === 'warning' ? 'bg-amber-100 text-amber-950 dark:bg-amber-500/15 dark:text-amber-200' : 'bg-accent text-accent-foreground',
          )}
        >
          <div>
            <p className="text-lg font-semibold">{widget.title}</p>
            {widget.body && <p className="mt-1 text-sm opacity-80">{widget.body}</p>}
          </div>
          {widget.href && (
            <Link href={widget.href} className="rounded-md bg-background/90 px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-background">
              {widget.cta ?? t('View all')}
            </Link>
          )}
        </div>
      )
    case 'chart':
      return (
        <Card className={cx('p-5 sm:col-span-2', widget.span === 'full' && 'lg:col-span-4')}>
          <p className="mb-4 text-sm font-medium">{widget.label}</p>
          <Chart data={widget.data} type={widget.type} />
        </Card>
      )
    case 'latest': {
      const resource = admin.resources[widget.resource]
      return (
        <Card className={cx('overflow-hidden sm:col-span-2', widget.span === 'full' && 'lg:col-span-4')}>
          <div className="flex items-center justify-between border-b px-5 py-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              {resource && <Icon name={resource.icon} className="text-muted-foreground" />}
              {t('Latest')}: {widget.label}
            </p>
            <Link href={`${admin.prefix}/${widget.resource}`} className="text-xs text-brand-ink hover:underline">
              {t('View all')}
            </Link>
          </div>
          <ul className="divide-y">
            {widget.rows.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">{t('Nothing here yet.')}</li>}
            {widget.rows.map((row) => (
              <li key={row.id}>
                <Link href={`${admin.prefix}/${widget.resource}/${row.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-muted/50">
                  <span className="truncate">{row.__title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{format.date(row.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )
    }
  }
}

/** src/modules/admin/views/pages/index.tsx. Widgets come from src/modules/admin/dashboard.ts, or defaults. */
export function DashboardPage() {
  const t = useAdminT()
  const { data, loading, error } = useAdminData<WidgetData[]>('dashboard', {}, [])
  return (
    <AdminPage title={t('Dashboard')} icon="layout-dashboard">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        {data?.map((w, i) => <Widget key={i} widget={w} />)}
      </div>
    </AdminPage>
  )
}
