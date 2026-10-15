import { useT, useTheme } from 'masar/react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/shared/ui/button'

const next = { light: 'dark', dark: 'system', system: 'light' } as const
const icons = { light: Sun, dark: Moon, system: Monitor }

/** Cycles light → dark → system. The choice is kept in a cookie, so the server renders it with no flash. */
export function ThemeToggle() {
  const t = useT()
  const { theme, setTheme } = useTheme()
  const Icon = icons[theme]
  const label = { light: t('Light theme'), dark: t('Dark theme'), system: t('System theme') }[theme]
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next[theme])} title={label} aria-label={label}>
      <Icon />
    </Button>
  )
}
