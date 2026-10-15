import type { FormEvent, ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

interface Props {
  title: string
  description: string
  fields: { name: string; label: string; type?: string; autoComplete?: string }[]
  submitLabel: string
  pending: boolean
  errors: Record<string, string>
  error: string | null
  onSubmit: (values: Record<string, string>) => void
  footer: ReactNode
  /** A success message shown above the form, e.g. "Check your inbox". */
  notice?: ReactNode
}

export function AuthCard({ title, description, fields, submitLabel, pending, errors, error, onSubmit, footer, notice }: Props) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onSubmit(Object.fromEntries(fields.map((field) => [field.name, String(data.get(field.name) ?? '')])))
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {notice && <p className="mb-5 rounded-md bg-accent px-3 py-2.5 text-sm text-accent-foreground">{notice}</p>}
          <form onSubmit={handleSubmit} className="grid gap-5">
            {fields.map((field) => (
              <div key={field.name} className="grid gap-2">
                <Label htmlFor={field.name}>{field.label}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type={field.type ?? 'text'}
                  autoComplete={field.autoComplete}
                  aria-invalid={Boolean(errors[field.name])}
                />
                {errors[field.name] && <p className="text-sm text-destructive">{errors[field.name]}</p>}
              </div>
            ))}
            {error && !Object.keys(errors).length && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}>
              {submitLabel}
            </Button>
            <p className="text-sm text-muted-foreground">{footer}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
