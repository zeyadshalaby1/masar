import { AdminPage, Card, Chart, StatCard, useAdminT } from '@zeyadshalaby1/masar/admin'
import type { AdminPageMeta } from '@zeyadshalaby1/masar/admin'

// Shown in the admin sidebar. Icons: any Lucide name in kebab-case (https://lucide.dev/icons).
export const admin: AdminPageMeta = { title: 'Sales report', icon: 'chart-bar', group: 'Reports' }

/** Runs on the server before the page renders (admins only, like the rest of the admin module). */
export async function load() {
  return {
    total: 0,
    points: [
      { label: 'Mon', value: 3 },
      { label: 'Tue', value: 5 },
      { label: 'Wed', value: 2 },
    ],
  }
}

export default function SalesReportPage({ total, points }: Awaited<ReturnType<typeof load>>) {
  const t = useAdminT()
  return (
    <AdminPage title={t('Sales report')} icon="chart-bar">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('Total')} value={total} icon="chart-bar" />
      </div>
      <Card className="p-5">
        <Chart data={points} />
      </Card>
    </AdminPage>
  )
}
