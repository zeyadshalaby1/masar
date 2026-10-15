import { useAction, useMasar, useT } from '@zeyadshalaby1/masar/react'
import { useState } from 'react'
import { resendVerification } from '@/modules/auth/actions'

/** Reminds signed-in users who have not opened the confirmation link yet. */
export function VerifyEmailBanner() {
  const t = useT()
  const { user } = useMasar()
  const [sent, setSent] = useState(false)
  const resend = useAction(resendVerification, { onSuccess: () => setSent(true) })
  if (!user || user.emailVerifiedAt) return null
  return (
    <div className="border-b bg-accent text-accent-foreground">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2 text-sm">
        <span>{t('Confirm your email: we sent a link to {email}.', { email: user.email })}</span>
        {sent ? (
          <span className="font-medium">{t('Sent. Check your inbox.')}</span>
        ) : (
          <button type="button" className="font-medium underline disabled:opacity-60" disabled={resend.pending} onClick={() => resend.run()}>
            {t('Send it again')}
          </button>
        )}
      </div>
    </div>
  )
}
