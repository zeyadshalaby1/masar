import { t } from '../i18n'
import { defineMail } from '../mail'
import { MailButton, MailHeading, MailLayout, MailLink, MailText } from '../mail/components'

/** Built-in auth mails, in the language of the request that triggers them. Keys are in the starter's locale files. */
export const verifyMail = defineMail<{ name: string; url: string; app: string }>({
  subject: () => t('Confirm your email'),
  render: ({ name, url, app }) => (
    <MailLayout brand={app} preview={t('Confirm your email to finish setting up your account.')} footer={t('If you did not create an account, ignore this mail.')}>
      <MailHeading>{t('Confirm your email')}</MailHeading>
      <MailText>{t('Hi {name}, confirm your email to finish setting up your account.', { name })}</MailText>
      <MailButton href={url}>{t('Confirm email')}</MailButton>
      <MailText muted>{t('Or open this link:')}</MailText>
      <MailLink href={url} />
    </MailLayout>
  ),
})

export const resetMail = defineMail<{ name: string; url: string; app: string }>({
  subject: () => t('Reset your password'),
  render: ({ name, url, app }) => (
    <MailLayout brand={app} preview={t('The link works for one hour.')} footer={t('If it was not you, ignore this mail: your password stays the same.')}>
      <MailHeading>{t('Reset your password')}</MailHeading>
      <MailText>{t('Hi {name}, someone asked to reset the password of your account. The link works for one hour.', { name })}</MailText>
      <MailButton href={url}>{t('Choose a new password')}</MailButton>
      <MailText muted>{t('Or open this link:')}</MailText>
      <MailLink href={url} />
    </MailLayout>
  ),
})
