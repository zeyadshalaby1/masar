import { useLocale, useT } from '@masar/core/react'
import { Languages } from 'lucide-react'
import { Button } from '@/shared/ui/button'

/**
 * Two languages: one button that switches to the other. More: a menu of every language.
 * Languages come from `locales` in src/config/app.ts, each shown in its own name.
 */
export function LanguageSwitcher() {
  const t = useT()
  const { locale, locales, setLocale } = useLocale()
  if (locales.length < 2) return null

  if (locales.length === 2) {
    const other = locales.find((l) => l.code !== locale)!
    return (
      <Button variant="ghost" size="sm" onClick={() => setLocale(other.code)} lang={other.code} aria-label={t('Change language')}>
        <Languages />
        {other.name}
      </Button>
    )
  }

  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Languages className="size-4" aria-hidden />
      <span className="sr-only">{t('Change language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        className="rounded-md bg-transparent py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {locales.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  )
}
