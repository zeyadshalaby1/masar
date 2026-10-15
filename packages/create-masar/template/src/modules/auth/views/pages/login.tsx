import { Link, router, useAction, usePage, useT } from 'masar/react'
import { login } from '../../actions'
import { AuthCard } from '../components/AuthCard'
import { safeRedirect } from '../components/redirect'

export const meta = (_props: unknown, t: (key: string) => string) => ({ title: t('Sign in'), noindex: false })

export default function Login() {
  const t = useT()
  // Keep ?redirect= when switching between sign in and sign up.
  const query = usePage().url.split('?')[1]
  const submit = useAction(login, { onSuccess: () => router.visit(safeRedirect(query ?? '')) })

  return (
    <AuthCard
      title={t('Sign in')}
      description={t('Welcome back.')}
      fields={[
        { name: 'email', label: t('Email'), type: 'email', autoComplete: 'email' },
        { name: 'password', label: t('Password'), type: 'password', autoComplete: 'current-password' },
      ]}
      submitLabel={t('Sign in')}
      pending={submit.pending}
      errors={submit.errors}
      error={submit.error}
      onSubmit={(values) => submit.run({ email: values.email ?? '', password: values.password ?? '' })}
      footer={
        <>
          <Link href="/forgot-password" className="underline">{t('Forgot your password?')}</Link>
          <br />
          {t('No account yet?')} <Link href={query ? `/register?${query}` : '/register'} className="underline">{t('Create one')}</Link>
        </>
      }
    />
  )
}
