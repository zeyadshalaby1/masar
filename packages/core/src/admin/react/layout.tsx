import { Link, router, usePage } from '@inertiajs/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocale, useTheme } from '../../react/i18n'
import type { AdminNavItem } from '../types'
import { Button, ConfirmProvider, cx, Icon, ToastProvider, useAdmin, useAdminT, useShared } from './kit'

function groupNav(items: AdminNavItem[]) {
  const groups: { title?: string; items: AdminNavItem[] }[] = []
  for (const item of items) {
    const group = groups.find((g) => g.title === item.group)
    if (group) group.items.push(item)
    else groups.push({ title: item.group, items: [item] })
  }
  return groups
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const admin = useAdmin()
  const { app } = useShared()
  const path = usePage().url.split('?')[0]!
  const isActive = (href: string) => (href === admin.prefix ? path === href : path === href || path.startsWith(`${href}/`))

  return (
    <div className="flex h-full flex-col">
      <Link href={admin.prefix} onClick={onNavigate} className="flex h-14 shrink-0 items-center gap-2.5 border-b px-5 font-semibold tracking-tight">
        <img src="/favicon.svg" alt="" className="size-6" />
        <span className="truncate">{app.name}</span>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groupNav(admin.nav).map((group, index) => (
          <div key={group.title ?? index}>
            {group.title && <p className="mb-1.5 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</p>}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cx(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive(item.href) ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon name={item.icon} />
                    <span className="truncate">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const t = useAdminT()
  const { user } = useShared()
  const { locale, locales, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const nextTheme = { light: 'dark', dark: 'system', system: 'light' } as const
  const themeIcon = { light: 'sun', dark: 'moon', system: 'monitor' }[theme]
  const other = locales.find((l) => l.code !== locale)

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label={t('Open menu')}>
        <Icon name="menu" />
      </Button>
      <a href="/" className="hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:flex">
        <Icon name="arrow-up-right" />
        {t('Back to site')}
      </a>
      <div className="ms-auto flex items-center gap-1">
        {locales.length === 2 && other && (
          <Button variant="ghost" size="sm" icon="languages" onClick={() => setLocale(other.code)} lang={other.code}>
            {other.name}
          </Button>
        )}
        {locales.length > 2 && (
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="h-8 rounded-md bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Language"
          >
            {locales.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <Button variant="ghost" size="icon" onClick={() => setTheme(nextTheme[theme])} aria-label={t({ light: 'Light', dark: 'Dark', system: 'System' }[theme])}>
          <Icon name={themeIcon} />
        </Button>
        {user && (
          <div className="ms-2 flex items-center gap-2 border-s ps-3">
            <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{user.name.charAt(0).toUpperCase()}</span>
            <span className="hidden text-sm md:block">{user.name}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('Sign out')}
              title={t('Sign out')}
              onClick={async () => {
                await fetch('/_masar/actions/auth/logout', { method: 'POST', headers: { 'x-masar-action': '1' } })
                router.visit('/')
              }}
            >
              <Icon name="log-out" />
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}

/**
 * The admin frame: a sidebar (a drawer on phones) built from resources and pages, and a top bar
 * with language, theme and account. Used as src/modules/admin/views/layout.tsx.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const t = useAdminT()
  const [open, setOpen] = useState(false)
  const url = usePage().url
  useEffect(() => setOpen(false), [url])

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="min-h-screen bg-muted/40">
          <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 border-e bg-background lg:block">
            <Sidebar />
          </aside>
          {open && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
              <aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw] border-e bg-background shadow-xl">
                <Button variant="ghost" size="icon" className="absolute end-2 top-2.5" onClick={() => setOpen(false)} aria-label={t('Close menu')}>
                  <Icon name="x" />
                </Button>
                <Sidebar onNavigate={() => setOpen(false)} />
              </aside>
            </div>
          )}
          <div className="lg:ps-64">
            <TopBar onMenu={() => setOpen(true)} />
            <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}

/** Page frame inside the admin: title, optional description, breadcrumbs and actions. */
export function AdminPage({
  title,
  description,
  icon,
  actions,
  back,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: string
  actions?: ReactNode
  back?: { href: string; label: string }
  children?: ReactNode
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {back && (
            <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <Icon name="chevron-left" className="rtl:rotate-180" />
              {back.label}
            </Link>
          )}
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            {icon && <Icon name={icon} className="size-6 text-brand-ink" />}
            <span className="truncate">{title}</span>
          </h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
