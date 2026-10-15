import { Link, useAction, useT } from '@masar/core/react'
import { useState } from 'react'
import { forgotPassword } from '../../actions'
import { AuthCard } from '../components/AuthCard'

export const meta = (_props: unknown, t: (key: string) => string) => ({ title: t('Forgot your password?'), noindex: false })

export default function ForgotPassword() {
  const t = useT()
  const [sent, setSent] = useState(false)
  const submit = useAction(forgotPassword, { onSuccess: () => setSent(true) })

  return (
    <AuthCard
      title={t('Forgot your password?')}
      description={t('We will mail you a link to choose a new one.')}
      notice={sent ? t('If an account uses this email, a reset link is on its way. Check your inbox.') : undefined}
      fields={[{ name: 'email', label: t('Email'), type: 'email', autoComplete: 'email' }]}
      submitLabel={t('Send the link')}
      pending={submit.pending}
      errors={submit.errors}
      error={submit.error}
      onSubmit={(values) => submit.run({ email: values.email ?? '' })}
      footer={<Link href="/login" className="underline">{t('Back to sign in')}</Link>}
    />
  )
}
