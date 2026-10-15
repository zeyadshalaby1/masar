import { router, usePage } from '@inertiajs/react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ActionValidationError } from '../../client/runtime'
import type { AdminField, AdminResource, AdminRow } from '../types'
import { checkField, FieldInput } from './inputs'
import { adminCall, Button, Card, cx, Skeleton, useAdminT, useConfirm, useFormat, useToast } from './kit'
import { AdminPage } from './layout'
import { ResourceTable, useResourceFromUrl } from './table'

type Values = Record<string, unknown>

function initialValues(resource: AdminResource, row: AdminRow | null): Values {
  const values: Values = {}
  for (const f of resource.fields) {
    if (!f.form) continue
    values[f.name] = row ? row[f.name] : f.default !== undefined ? f.default : f.input === 'switch' ? false : f.input === 'files' || f.input === 'tags' ? [] : null
    if (f.input === 'password') values[f.name] = ''
  }
  return values
}

function Field({ field, children, error }: { field: AdminField; children: React.ReactNode; error?: string }) {
  return (
    <div className={cx('space-y-1.5', field.span === 'full' && 'sm:col-span-2')}>
      <label htmlFor={`f-${field.name}`} className="flex items-center gap-1 text-sm font-medium">
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
    </div>
  )
}

/** Create or edit form for one resource, with client checks and the server's 422 errors per field. */
export function ResourceForm({ resource, row, onSaved }: { resource: AdminResource; row: AdminRow | null; onSaved: (row: AdminRow, again: boolean) => void }) {
  const t = useAdminT()
  const toast = useToast()
  const [values, setValues] = useState<Values>(() => initialValues(resource, row))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  useEffect(() => setValues(initialValues(resource, row)), [resource, row])

  const byName = useMemo(() => new Map(resource.fields.map((f) => [f.name, f])), [resource])
  const sections = useMemo(() => {
    const out: { title?: string; fields: AdminField[] }[] = []
    let loose: AdminField[] = []
    for (const item of resource.form) {
      if (typeof item === 'string') {
        const f = byName.get(item)
        if (f?.form) loose.push(f)
      } else {
        if (loose.length) out.push({ fields: loose }), (loose = [])
        out.push({ title: item.title, fields: item.fields.map((n) => byName.get(n)!).filter((f) => f?.form) })
      }
    }
    if (loose.length) out.push({ fields: loose })
    // Fields a custom `form` order left out still need a place (e.g. the users' password).
    const placed = new Set(out.flatMap((s) => s.fields.map((f) => f.name)))
    const rest = resource.fields.filter((f) => f.form && !placed.has(f.name) && !f.readonly)
    if (rest.length && typeof resource.form[0] !== 'string') out.push({ fields: rest })
    return out
  }, [resource, byName])

  const set = (name: string, value: unknown) => {
    setValues((v) => ({ ...v, [name]: value }))
    if (touched.has(name) || errors[name]) {
      const message = checkField(byName.get(name)!, value, t, Boolean(row))
      setErrors((e) => {
        const next = { ...e }
        if (message) next[name] = message
        else delete next[name]
        return next
      })
    }
  }

  const submit = async (event: FormEvent, again = false) => {
    event.preventDefault()
    const found: Record<string, string> = {}
    for (const f of resource.fields) {
      if (!f.form || f.readonly) continue
      const message = checkField(f, values[f.name], t, Boolean(row))
      if (message) found[f.name] = message
    }
    setTouched(new Set(Object.keys(values)))
    setErrors(found)
    if (Object.keys(found).length) {
      setFormError(t('Fix the highlighted fields'))
      document.getElementById(`f-${Object.keys(found)[0]}`)?.focus()
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const saved = await adminCall<AdminRow>('save', { resource: resource.name, id: row?.id, values })
      toast(row ? t('Saved') : t('Created'))
      onSaved(saved, again)
      if (again) setValues(initialValues(resource, null))
    } catch (e) {
      if (e instanceof ActionValidationError) {
        setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0] ?? ''])))
        setFormError(e.message)
        document.getElementById(`f-${Object.keys(e.errors)[0]}`)?.focus()
      } else {
        setFormError((e as Error).message || t('Something went wrong'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => submit(e)} noValidate className="space-y-6">
      {sections.map((section, index) => (
        <Card key={section.title ?? index} className="p-5 sm:p-6">
          {section.title && <h2 className="mb-5 text-base font-semibold">{section.title}</h2>}
          <div className="grid gap-5 sm:grid-cols-2">
            {section.fields.map((f) => (
              <Field key={f.name} field={f} error={errors[f.name]}>
                <div onBlur={() => setTouched((s) => new Set(s).add(f.name))}>
                  <FieldInput field={f} value={values[f.name]} onChange={(v) => set(f.name, v)} invalid={Boolean(errors[f.name])} resource={resource.name} values={values} />
                </div>
              </Field>
            ))}
          </div>
        </Card>
      ))}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <div className="ms-auto flex gap-2">
          {!row && resource.can.create && (
            <Button disabled={saving} onClick={(e) => submit(e, true)}>
              {t('Save and add another')}
            </Button>
          )}
          <Button type="submit" variant="primary" icon="check" loading={saving}>
            {row ? t('Save changes') : t('Save')}
          </Button>
        </div>
      </div>
    </form>
  )
}

/** src/modules/admin/views/pages/[resource]/new.tsx and [resource]/[id].tsx */
export function ResourceRecordPage() {
  const t = useAdminT()
  const toast = useToast()
  const confirm = useConfirm()
  const format = useFormat()
  const { resource, id } = useResourceFromUrl()
  const admin = usePage<{ masar: { admin: { prefix: string; resources: Record<string, AdminResource> } } }>().props.masar.admin
  const [row, setRow] = useState<AdminRow | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!resource || !id) return
    setLoading(true)
    adminCall<AdminRow>('record', { resource: resource.name, id })
      .then(setRow)
      .catch(() => setMissing(true))
      .finally(() => setLoading(false))
  }, [resource, id])

  if (!resource || missing) return <AdminPage title={t('Not found')} back={{ href: admin.prefix, label: t('Dashboard') }} />
  const list = `${admin.prefix}/${resource.name}`

  return (
    <AdminPage
      title={id ? (row?.__title ?? '…') : t('New {name}', { name: resource.singular })}
      description={row ? `${t('Created at')}: ${format.date(row.createdAt)} · ${t('Updated at')}: ${format.date(row.updatedAt)}` : undefined}
      back={{ href: list, label: resource.label }}
      actions={
        row &&
        resource.can.delete && (
          <Button
            variant="ghost"
            icon="trash-2"
            className="text-destructive"
            onClick={async () => {
              if (!(await confirm({ title: t('Delete this record?'), body: t('This cannot be undone.'), confirm: t('Delete'), destructive: true }))) return
              await adminCall('delete', { resource: resource.name, ids: [row.id] })
              toast(t('Deleted'))
              router.visit(list)
            }}
          >
            {t('Delete')}
          </Button>
        )
      }
    >
      {loading ? (
        <Card className="space-y-4 p-6">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-24" />
        </Card>
      ) : (
        <ResourceForm
          resource={resource}
          row={row}
          onSaved={(saved, again) => {
            if (again) return
            if (id) setRow(saved)
            else router.visit(`${list}/${saved.id}`)
          }}
        />
      )}
      {row &&
        resource.children
          .filter((c) => admin.resources[c.resource])
          .map((c) => (
            <section key={`${c.resource}.${c.field}`} className="space-y-3">
              <h2 className="text-lg font-semibold">{c.label}</h2>
              <ResourceTable resource={admin.resources[c.resource]!} parent={{ field: c.field, id: row.id }} compact />
            </section>
          ))}
    </AdminPage>
  )
}
