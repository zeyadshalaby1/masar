import { Link, useMasar, useT } from '@masar/core/react'

const getSteps = (t: ReturnType<typeof useT>) => [
  {
    title: t('Create a module'),
    body: t('Model, actions, pages and a form, generated and working.'),
    command: 'pnpm masar make:module courses',
  },
  {
    title: t('Open it'),
    body: t('New modules join the navigation and the database on save.'),
    command: 'http://localhost:3000/courses',
  },
  {
    title: t('Ship it'),
    body: t('One server, one build, any Node host.'),
    command: 'pnpm build && pnpm start',
  },
]

export default function Home() {
  const t = useT()
  const steps = getSteps(t)
  const { app, nav } = useMasar()
  const modules = nav.filter((item) => item.href !== '/')

  return (
    <div className="mx-auto max-w-3xl px-6 pt-20 pb-24">
      <h1 className="text-5xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">{t('{name} is running.', { name: app.name })}</h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
        {t('This page lives in')} <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">src/modules/home/views/pages/index.tsx</code>.
        {t('Edit it and save to see the change.')}
      </p>

      <ol className="relative mt-16 space-y-12">
        <svg
          aria-hidden
          className="absolute top-3 bottom-3 start-[11px] h-[calc(100%-1.5rem)] w-3 text-brand"
          preserveAspectRatio="none"
          viewBox="0 0 12 100"
        >
          <path d="M6 0 C 12 25, 0 50, 6 70 S 6 100, 6 100" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        </svg>
        {steps.map((step, index) => (
          <li key={step.title} className="relative ps-12">
            <span
              className={
                index === steps.length - 1
                  ? 'absolute start-0 top-1 grid size-6 place-items-center rounded-full bg-brand text-xs font-semibold text-primary-foreground'
                  : 'absolute start-0 top-1 grid size-6 place-items-center rounded-full border-2 border-brand bg-background text-xs font-semibold'
              }
            >
              {index + 1}
            </span>
            <h2 className="text-xl font-semibold tracking-tight">{step.title}</h2>
            <p className="mt-1 text-muted-foreground">{step.body}</p>
            <code className="mt-3 inline-block rounded-md bg-foreground px-3 py-1.5 font-mono text-sm text-background">
              {step.command}
            </code>
          </li>
        ))}
      </ol>

      <section className="mt-20 border-t pt-8">
        <h2 className="text-sm font-medium text-muted-foreground">{t('Modules in this app')}</h2>
        {modules.length === 0 ? (
          <p className="mt-3 text-muted-foreground">{t('Only home so far. Your first module appears here.')}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {modules.map((item) => (
              <li key={item.name}>
                <Link href={item.href} className="inline-flex rounded-full border px-4 py-1.5 text-sm hover:border-brand hover:text-brand-ink">
                  {t(item.title)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
