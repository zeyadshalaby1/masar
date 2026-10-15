import { Link, router, useAction, usePage, useT } from 'masar/react'
import { register } from '../../actions'
import { AuthCard } from '../components/AuthCard'
import { safeRedirect } from '../components/redirect'

export const meta = (_props: unknown, t: (key: string) => string) => ({ title: t('Create an account'), noindex: false })

export default function Register() {
  const t = useT()
  // Keep ?redirect= when switching between sign in and sign up.
  const query = usePage().url.split('?')[1]
  const submit = useAction(register, { onSuccess: () => router.visit(safeRedirect(query ?? '')) })

  return (
    <AuthCard
      title={t('Create an account')}
      description={t('It takes a few seconds.')}
      fields={[
        { name: 'name', label: t('Name'), autoComplete: 'name' },
        { name: 'email', label: t('Email'), type: 'email', autoComplete: 'email' },
        { name: 'password', label: t('Password'), type: 'password', autoComplete: 'new-password' },
      ]}
      submitLabel={t('Create account')}
      pending={submit.pending}
      errors={submit.errors}
      error={submit.error}
      onSubmit={(values) => submit.run({ name: values.name ?? '', email: values.email ?? '', password: values.password ?? '' })}
      footer={
        <>
          {t('Already registered?')} <Link href={query ? `/login?${query}` : '/login'} className="underline">{t('Sign in')}</Link>
        </>
      }
    />
  )
}
