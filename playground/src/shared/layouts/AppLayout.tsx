import type { ReactNode } from 'react'
import { Navbar } from '@/shared/components/Navbar'
import { VerifyEmailBanner } from '@/shared/components/VerifyEmailBanner'

/** Wraps every page. Swap or configure the Navbar here; its parts live in src/shared/components. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <VerifyEmailBanner />
      <main>{children}</main>
    </div>
  )
}
