import { Link, router, useAction, usePage, useT } from '@zeyadshalaby1/masar/react'
import { resetPassword } from '../../actions'
import { AuthCard } from '../components/AuthCard'

export const meta = (_props: unknown, t: (key: string) => string) => ({ title: t('Choose a new password'), noindex: true })

export default function ResetPassword() {
  const t = useT()
  const token = new URLSearchParams(usePage().url.split('?')[1] ?? '').get('token') ?? ''
  const submit = useAction(resetPassword, { onSuccess: () => router.visit('/') })

  return (
    <AuthCard
      title={t('Choose a new password')}
      description={t('You will be signed in right after.')}
      fields={[{ name: 'password', label: t('New password'), type: 'password', autoComplete: 'new-password' }]}
      submitLabel={t('Save password')}
      pending={submit.pending}
      errors={submit.errors}
      error={submit.error}
      onSubmit={(values) => submit.run({ token, password: values.password ?? '' })}
      footer={<Link href="/forgot-password" className="underline">{t('Ask for a new link')}</Link>}
    />
  )
}
