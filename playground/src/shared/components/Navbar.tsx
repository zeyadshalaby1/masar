import { Link, router, useMasar, usePage, useT } from '@zeyadshalaby1/masar/react'
import type { ReactNode } from 'react'
import { logout } from '@/modules/auth/actions'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'

interface Props {
  /** Extra items before the language and theme controls, e.g. a search box. */
  actions?: ReactNode
  /** Hide parts you don't need. */
  showLanguage?: boolean
  showTheme?: boolean
  showUser?: boolean
}

/** The app bar: brand, a link per module that has an index page, then language, theme and account. */
export function Navbar({ actions, showLanguage = true, showTheme = true, showUser = true }: Props) {
  const t = useT()
  const { app, nav, user } = useMasar()
  const path = usePage().url.split('?')[0]

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-6" />
          {app.name}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {nav
            .filter((item) => item.href !== '/')
            .map((item) => {
              const active = path === item.href || path?.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'rounded-md px-3 py-1.5 transition-colors',
                    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(item.title)}
                </Link>
              )
            })}
        </nav>
        <div className="ms-auto flex items-center gap-1">
          {actions}
          {showLanguage && <LanguageSwitcher />}
          {showTheme && <ThemeToggle />}
          {showUser &&
            (user ? (
              <>
                {user.role === 'admin' && (
                  <Button asChild variant="ghost" size="sm">
                    <a href="/admin">{t('Admin')}</a>
                  </Button>
                )}
                <span className="px-2 text-sm text-muted-foreground">{user.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await logout()
                    router.visit('/login')
                  }}
                >
                  {t('Sign out')}
                </Button>
              </>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t('Sign in')}</Link>
              </Button>
            ))}
        </div>
      </div>
    </header>
  )
}
