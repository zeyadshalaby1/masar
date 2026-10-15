import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { uploadFile, type UploadedFile } from '../../client/runtime'
import type { AdminField } from '../types'
import { adminCall, Button, cx, Icon, inputClass, Spinner, TextArea, TextInput, useAdminT, useDebounced, useFormat } from './kit'

type T = ReturnType<typeof useAdminT>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function acceptsFile(accept: string[] | undefined, file: File) {
  if (!accept?.length) return true
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
  return accept.some((rule) => (rule.startsWith('.') ? rule.toLowerCase() === ext : rule.endsWith('/*') ? file.type.startsWith(rule.slice(0, -1)) : rule === file.type))
}

/** Same checks the server makes, so most mistakes show before saving. The server stays the judge. */
export function checkField(field: AdminField, value: unknown, t: T, editing: boolean): string | null {
  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  if (field.input === 'password') return !editing && empty ? t('This field is required') : null
  if (empty) return field.required && field.input !== 'switch' ? t('This field is required') : null
  switch (field.input) {
    case 'email':
      return EMAIL.test(String(value).trim()) ? null : t('Enter a valid email')
    case 'url':
      try {
        new URL(String(value))
        return null
      } catch {
        return t('Enter a valid URL')
      }
    case 'number':
      return Number.isFinite(Number(value)) ? null : t('Enter a number')
    case 'json':
      if (typeof value !== 'string') return null
      try {
        JSON.parse(value)
        return null
      } catch {
        return t('Invalid JSON')
      }
    case 'date':
    case 'datetime':
      return Number.isNaN(new Date(String(value)).getTime()) ? t('Pick a valid date') : null
  }
  return null
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

const toLocalInput = (value: unknown, withTime: boolean) => {
  if (!value) return ''
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return ''
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
  return withTime ? local.slice(0, 16) : local.slice(0, 10)
}

interface InputProps {
  field: AdminField
  value: unknown
  onChange: (value: unknown) => void
  invalid: boolean
  resource: string
  values: Record<string, unknown>
}

export function FieldInput({ field, value, onChange, invalid, resource, values }: InputProps) {
  const t = useAdminT()
  const common = { id: `f-${field.name}`, 'aria-invalid': invalid || undefined, disabled: field.readonly, placeholder: field.placeholder }
  const [touchedSlug, setTouchedSlug] = useState(Boolean(value))
  const source = field.from ? values[field.from] : undefined
  useEffect(() => {
    if (field.input === 'slug' && field.from && !touchedSlug && typeof source === 'string') onChange(slugify(source))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  switch (field.input) {
    case 'textarea':
      return <TextArea {...common} rows={5} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    case 'markdown':
      return <MarkdownInput {...common} value={String(value ?? '')} onChange={onChange} />
    case 'number':
      return <TextInput {...common} type="number" inputMode="decimal" step="any" value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />
    case 'switch':
      return (
        <button
          type="button"
          role="switch"
          id={common.id}
          aria-checked={Boolean(value)}
          disabled={field.readonly}
          onClick={() => onChange(!value)}
          className={cx('relative h-6 w-11 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring outline-none', value ? 'bg-primary' : 'bg-input')}
        >
          <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', value ? 'start-[22px]' : 'start-0.5')} />
        </button>
      )
    case 'select':
      return (
        <select {...common} className={cx(inputClass, 'h-9')} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t('Choose…')}</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'radio':
      return (
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {field.options?.map((o) => (
            <label key={o.value} className={cx('flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm', value === o.value ? 'border-ring bg-accent text-accent-foreground' : 'border-input')}>
              <input type="radio" className="sr-only" name={field.name} checked={value === o.value} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )
    case 'date':
      return <TextInput {...common} type="date" value={toLocalInput(value, false)} onChange={(e) => onChange(e.target.value || null)} />
    case 'datetime':
      return <TextInput {...common} type="datetime-local" value={toLocalInput(value, true)} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />
    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input type="color" className="size-9 cursor-pointer rounded-md border border-input bg-transparent p-1" value={String(value || '#ff5a1f')} onChange={(e) => onChange(e.target.value)} disabled={field.readonly} />
          <TextInput {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="font-mono" />
        </div>
      )
    case 'password':
      return <TextInput {...common} type="password" autoComplete="new-password" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    case 'slug':
      return (
        <TextInput
          {...common}
          dir="ltr"
          className="font-mono"
          value={String(value ?? '')}
          onChange={(e) => {
            setTouchedSlug(true)
            onChange(slugify(e.target.value) + (e.target.value.endsWith('-') ? '-' : ''))
          }}
        />
      )
    case 'json':
      return (
        <TextArea
          {...common}
          dir="ltr"
          rows={6}
          className="font-mono text-xs"
          value={typeof value === 'string' ? value : value === null || value === undefined ? '' : JSON.stringify(value, null, 2)}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'tags':
      return <TagsInput value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} disabled={field.readonly} />
    case 'ref':
      return <RefInput field={field} value={value as string | null} onChange={onChange} invalid={invalid} />
    case 'file':
    case 'files':
      return <FileInput field={field} value={value} onChange={onChange} resource={resource} />
    case 'email':
    case 'url':
      return <TextInput {...common} type={field.input} dir="ltr" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    default:
      return <TextInput {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
  }
}

// ── Markdown with a safe preview ───────────────────────────────────────────
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** A small Markdown subset; everything is escaped first, so the preview cannot run script. */
export function renderMarkdown(text: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="rounded bg-muted px-1">$1</code>')
      .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="underline" href="$2" target="_blank" rel="noreferrer">$1</a>')
  const out: string[] = []
  let list = false
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*[-*]\s+(.*)/)
    if (item) {
      if (!list) out.push('<ul class="list-disc ps-5">')
      list = true
      out.push(`<li>${inline(item[1]!)}</li>`)
      continue
    }
    if (list) out.push('</ul>'), (list = false)
    const heading = line.match(/^(#{1,3})\s+(.*)/)
    if (heading) out.push(`<h${heading[1]!.length + 1} class="font-semibold">${inline(heading[2]!)}</h${heading[1]!.length + 1}>`)
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`)
  }
  if (list) out.push('</ul>')
  return out.join('')
}

function MarkdownInput({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void; id: string; disabled?: boolean; 'aria-invalid'?: boolean }) {
  const t = useAdminT()
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  return (
    <div className="rounded-md border border-input">
      <div className="flex gap-1 border-b p-1">
        {(['write', 'preview'] as const).map((name) => (
          <button key={name} type="button" onClick={() => setTab(name)} className={cx('rounded px-3 py-1 text-xs', tab === name ? 'bg-muted font-medium' : 'text-muted-foreground')}>
            {t(name === 'write' ? 'Write' : 'Preview')}
          </button>
        ))}
      </div>
      {tab === 'write' ? (
        <TextArea {...rest} rows={10} className="rounded-none border-0 shadow-none focus-visible:ring-0" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="min-h-40 space-y-2 p-3 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
      )}
    </div>
  )
}

function TagsInput({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const tag = draft.trim()
    if (tag && !value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }
  return (
    <div className={cx(inputClass, 'flex min-h-9 flex-wrap items-center gap-1.5 py-1.5')}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
          {tag}
          <button type="button" onClick={() => onChange(value.filter((v) => v !== tag))} disabled={disabled} aria-label="Remove">
            <Icon name="x" className="size-3" />
          </button>
        </span>
      ))}
      <input
        className="min-w-24 flex-1 bg-transparent outline-none"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') e.preventDefault(), add()
          if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={add}
      />
    </div>
  )
}

// ── Reference picker: searches the related resource ────────────────────────
function RefInput({ field, value, onChange, invalid }: { field: AdminField; value: string | null; onChange: (v: string | null) => void; invalid: boolean }) {
  const t = useAdminT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [label, setLabel] = useState<string | null>(null)
  const [results, setResults] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(false)
  const debounced = useDebounced(query, 250)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!value) return setLabel(null)
    adminCall<{ value: string; label: string }[]>('options', { resource: field.ref, ids: [value] }).then((r) => setLabel(r[0]?.label ?? value))
  }, [value, field.ref])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    adminCall<{ value: string; label: string }[]>('options', { resource: field.ref, q: debounced })
      .then(setResults)
      .finally(() => setLoading(false))
  }, [open, debounced, field.ref])

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        id={`f-${field.name}`}
        aria-invalid={invalid || undefined}
        disabled={field.readonly}
        onClick={() => setOpen((o) => !o)}
        className={cx(inputClass, 'flex h-9 items-center justify-between gap-2 text-start')}
      >
        <span className={cx('truncate', !label && 'text-muted-foreground')}>{label ?? t('Choose…')}</span>
        <Icon name="chevrons-up-down" className="text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          <div className="border-b p-2">
            <TextInput autoFocus placeholder={t('Type to search…')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <ul className="max-h-64 overflow-y-auto p-1" role="listbox">
            {!field.required && (
              <li>
                <button type="button" className="w-full rounded px-3 py-2 text-start text-sm text-muted-foreground hover:bg-muted" onClick={() => (onChange(null), setOpen(false))}>
                  {t('None')}
                </button>
              </li>
            )}
            {loading && (
              <li className="flex justify-center p-3">
                <Spinner />
              </li>
            )}
            {!loading && results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t('No matches')}</li>}
            {!loading &&
              results.map((r) => (
                <li key={r.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={r.value === value}
                    className={cx('flex w-full items-center justify-between rounded px-3 py-2 text-start text-sm hover:bg-muted', r.value === value && 'font-medium')}
                    onClick={() => (onChange(r.value), setLabel(r.label), setOpen(false))}
                  >
                    <span className="truncate">{r.label}</span>
                    {r.value === value && <Icon name="check" />}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Files: drag and drop, progress, previews ───────────────────────────────
type Pending = { id: string; name: string; progress: number; error?: string }

export function FilePreview({ file, className }: { file: UploadedFile; className?: string }) {
  const url = file.url
  if (url && file.type.startsWith('image/')) return <img src={url} alt={file.name} className={cx('object-cover', className)} loading="lazy" />
  if (url && file.type.startsWith('video/')) return <video src={url} className={cx('object-cover', className)} controls preload="metadata" />
  return (
    <div className={cx('grid place-items-center bg-muted text-muted-foreground', className)}>
      <Icon name={file.type.startsWith('video/') ? 'film' : file.type.startsWith('audio/') ? 'music' : file.type === 'application/pdf' ? 'file-text' : 'file'} className="size-6" />
    </div>
  )
}

function FileInput({ field, value, onChange, resource }: { field: AdminField; value: unknown; onChange: (v: unknown) => void; resource: string }) {
  const t = useAdminT()
  const format = useFormat()
  const many = field.file?.many ?? false
  const files = useMemo(() => (many ? ((value as UploadedFile[] | null) ?? []) : value ? [value as UploadedFile] : []), [value, many])
  const [pending, setPending] = useState<Pending[]>([])
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef(files)
  latest.current = files

  const start = async (list: FileList | File[]) => {
    const chosen = [...list].slice(0, many ? undefined : 1)
    for (const file of chosen) {
      const id = `${file.name}-${Date.now()}-${Math.random()}`
      const max = field.file?.maxSize
      const error = !acceptsFile(field.file?.accept, file)
        ? `${file.name}: ${t('Pick one of the options')} (${field.file?.accept?.join(', ')})`
        : max && file.size > max
          ? `${file.name}: ${t('Max {size}', { size: format.size(max) })}`
          : undefined
      setPending((p) => [...p, { id, name: file.name, progress: 0, error }])
      if (error) continue
      try {
        const stored = await uploadFile(file, { model: resource, field: field.name, onProgress: (progress) => setPending((p) => p.map((x) => (x.id === id ? { ...x, progress } : x))) })
        onChange(many ? [...latest.current, stored] : stored)
        setPending((p) => p.filter((x) => x.id !== id))
      } catch (e) {
        setPending((p) => p.map((x) => (x.id === id ? { ...x, error: `${file.name}: ${(e as Error).message}` } : x)))
      }
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (!field.readonly && e.dataTransfer.files.length) void start(e.dataTransfer.files)
  }

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <ul className={cx('grid gap-3', many ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-1 sm:max-w-sm')}>
          {files.map((file, index) => (
            <li key={`${file.path}-${index}`} className="group relative overflow-hidden rounded-lg border bg-background">
              <FilePreview file={file} className="aspect-video w-full" />
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-muted-foreground">{format.size(file.size)}</span>
              </div>
              {!field.readonly && (
                <button
                  type="button"
                  onClick={() => onChange(many ? files.filter((_, i) => i !== index) : null)}
                  className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-background/90 shadow opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label={t('Remove')}
                >
                  <Icon name="trash-2" className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.map((p) => (
        <div key={p.id} className={cx('rounded-md border px-3 py-2 text-xs', p.error && 'border-destructive text-destructive')}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{p.error ?? p.name}</span>
            {p.error ? (
              <button type="button" onClick={() => setPending((list) => list.filter((x) => x.id !== p.id))} aria-label={t('Remove')}>
                <Icon name="x" className="size-3.5" />
              </button>
            ) : (
              <span>{Math.round(p.progress * 100)}%</span>
            )}
          </div>
          {!p.error && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${p.progress * 100}%` }} />
            </div>
          )}
        </div>
      ))}
      {!field.readonly && (many || files.length === 0) && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cx(
            'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-ring',
            over ? 'border-ring bg-accent' : 'border-input hover:bg-muted/60',
          )}
        >
          <Icon name="upload-cloud" className="size-6 text-muted-foreground" />
          <span>{t(many ? 'Drop files here or click to upload' : 'Drop a file here or click to upload')}</span>
          <span className="text-xs text-muted-foreground">
            {[field.file?.accept?.join(', '), field.file?.maxSize ? t('Max {size}', { size: format.size(field.file.maxSize) }) : null].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}
      {files.length > 0 && !many && !field.readonly && (
        <Button size="sm" icon="refresh-cw" onClick={() => input.current?.click()}>
          {t('Replace')}
        </Button>
      )}
      <input ref={input} type="file" hidden multiple={many} accept={field.file?.accept?.join(',')} onChange={(e) => e.target.files && (void start(e.target.files), (e.target.value = ''))} />
    </div>
  )
}
