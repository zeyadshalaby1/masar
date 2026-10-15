import type { LoadContext } from '@masar/core'
import { Link, useT, type PageProps } from '@masar/core/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { verifyEmail } from '../../actions'

export const meta = (_props: unknown, t: (key: string) => string) => ({ title: t('Confirm your email'), noindex: true })

/** The link in the confirmation mail lands here; the token is checked on the server. */
export async function load({ query }: LoadContext) {
  return { verified: await verifyEmail({ token: query.get('token') ?? '' }) }
}

export default function VerifyEmail({ verified }: PageProps<typeof load>) {
  const t = useT()
  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{verified ? t('Email confirmed') : t('This link is invalid or expired. Ask for a new one.')}</CardTitle>
          <CardDescription>{verified ? t('Thanks, your account is ready.') : t('Sign in and send the confirmation mail again.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/" className="text-sm underline">
            {t('Go to the home page')}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
