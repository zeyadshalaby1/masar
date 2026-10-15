import { useT } from '@masar/core/react'
import type { FormEvent } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'

export interface CourseValues {
  title: string
  description: string
}

interface Props {
  defaultValues?: { title?: string; description?: string | null }
  submitLabel: string
  pending: boolean
  errors: Record<string, string>
  error?: string | null
  onSubmit: (values: CourseValues) => Promise<unknown>
  /** Clear the form after a successful submit. */
  resetOnSuccess?: boolean
}

export function CourseForm({ defaultValues, submitLabel, pending, errors, error, onSubmit, resetOnSuccess }: Props) {
  const t = useT()
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const result = await onSubmit({
      title: String(data.get('title') ?? ''),
      description: String(data.get('description') ?? ''),
    })
    if (result !== undefined && resetOnSuccess) form.reset()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="title">{t('Title')}</Label>
        <Input id="title" name="title" defaultValue={defaultValues?.title ?? ''} aria-invalid={Boolean(errors.title)} />
        {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">{t('Description')}</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ''}
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t('Saving…') : submitLabel}
        </Button>
      </div>
    </form>
  )
}
