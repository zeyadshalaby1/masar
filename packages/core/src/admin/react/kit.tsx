/// <reference path="./virtual.d.ts" />
import { usePage } from '@inertiajs/react'
import { icons } from 'virtual:masar/icons'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { ActionError, ActionValidationError } from '../../client/runtime'
import { translate, type Params } from '../../i18n/shared'
import type { I18nShared } from '../../react/i18n'
import { ADMIN_AR } from '../messages'
import type { AdminShared } from '../types'

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

// ── Data ───────────────────────────────────────────────────────────────────
interface SharedProps {
  masar: { admin: AdminShared | null; i18n: I18nShared; user: { name: string; email: string; role: string } | null; app: { name: string } }
}

export function useShared() {
  return (usePage().props as unknown as SharedProps).masar
}

export function useAdmin(): AdminShared {
  const admin = useShared().admin
  if (!admin) throw new Error('[masar] Admin pages need the admin module (src/modules/admin) and an admin user.')
  return admin
}

/** Admin texts: app translations first, then the admin's built-in Arabic, then the key. */
export function useAdminT() {
  const { i18n } = useShared()
  return useCallback(
    (key: string, params?: Params) => {
      const own = i18n.locale.startsWith('ar') ? ADMIN_AR : {}
      return translate(i18n.messages[key] ? i18n.messages : own, key, params)
    },
    [i18n],
  )
}

/** POST /_masar/admin/<op>. Throws ActionValidationError on 422 like actions do. */
export async function adminCall<T>(op: string, body: unknown): Promise<T> {
  const response = await fetch(`/_masar/admin/${op}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-masar-action': '1' },
    body: JSON.stringify(body),
  })
  if (op === 'export' && response.ok) return (await response.text()) as T
  const data = (await response.json().catch(() => null)) as { data?: T; message?: string; errors?: Record<string, string[]>; hint?: string } | null
  if (response.status === 422 && data?.errors) throw new ActionValidationError(data.errors, data.message ?? 'Invalid data')
  if (!response.ok) throw new ActionError(data?.message ?? response.statusText, response.status, data?.hint)
  return data?.data as T
}

/** Load data from the admin API with loading/error state; `reload` refetches. */
export function useAdminData<T>(op: string, body: unknown, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setLoading(true)
    adminCall<T>(op, body)
      .then((result) => live && (setData(result), setError(null)))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData }
}

// ── Icons: any Lucide icon by its kebab-case name ──────────────────────────
// The Masar plugin bundles only the names the app uses (icon: '...', <Icon name="..." />).
export function Icon({ name, className }: { name?: string; className?: string }) {
  const Component = icons[name ?? 'circle'] ?? icons.circle
  if (!Component) return <span className={cx('inline-block size-4 shrink-0', className)} />
  return <Component className={cx('size-4 shrink-0', className)} aria-hidden />
}

// ── Primitives ─────────────────────────────────────────────────────────────
type Variant = 'primary' | 'outline' | 'ghost' | 'destructive' | 'subtle'
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm',
  outline: 'border border-input bg-background hover:bg-muted',
  ghost: 'hover:bg-muted',
  destructive: 'bg-destructive text-white hover:opacity-90',
  subtle: 'bg-muted hover:bg-muted/70',
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'icon'; icon?: string; loading?: boolean }>(
  function Button({ variant = 'outline', size = 'md', icon, loading, className, children, disabled, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || loading}
        className={cx(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          size === 'sm' ? 'h-8 px-3' : size === 'icon' ? 'size-9' : 'h-9 px-4',
          variants[variant],
          className,
        )}
        {...props}
      >
        {loading ? <Spinner /> : icon ? <Icon name={icon} /> : null}
        {children}
      </button>
    )
  },
)

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-e-transparent', className)} aria-hidden />
}

export const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20'

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} className={cx(inputClass, 'h-9', className)} {...props} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx(inputClass, 'min-h-24', className)} {...props} />
})

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border bg-card text-card-foreground shadow-xs', className)}>{children}</div>
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'brand' | 'success' | 'danger' }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    brand: 'bg-accent text-accent-foreground',
    success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    danger: 'bg-destructive/12 text-destructive',
  }
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-muted', className)} />
}

// ── Toasts ─────────────────────────────────────────────────────────────────
type Toast = { id: number; text: string; tone: 'success' | 'error' }
const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((list) => [...list, { id, text, tone }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg',
              t.tone === 'error' ? 'bg-destructive text-white' : 'bg-foreground text-background',
            )}
          >
            <Icon name={t.tone === 'error' ? 'circle-alert' : 'circle-check'} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

// ── Confirm dialog ─────────────────────────────────────────────────────────
type ConfirmOptions = { title: string; body?: string; confirm?: string; destructive?: boolean }
const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useAdminT()
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })), [])
  const close = (ok: boolean) => {
    state?.resolve(ok)
    setState(null)
  }
  useEffect(() => {
    if (!state) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => close(false)}>
          <div role="alertdialog" aria-modal className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">{state.title}</h2>
            {state.body && <p className="mt-2 text-sm text-muted-foreground">{state.body}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => close(false)}>{t('Cancel')}</Button>
              <Button ref={confirmRef} variant={state.destructive ? 'destructive' : 'primary'} onClick={() => close(true)}>
                {state.confirm ?? t('Confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)

// ── Formatting ─────────────────────────────────────────────────────────────
export function useFormat() {
  const { i18n } = useShared()
  const locale = i18n.locale
  return {
    date: (value: unknown) => {
      if (!value) return ''
      const d = new Date(String(value))
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
    },
    number: (value: unknown) => (typeof value === 'number' ? value.toLocaleString(locale) : String(value ?? '')),
    size: (bytes: number) =>
      bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`,
  }
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [current, setCurrent] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return current
}
