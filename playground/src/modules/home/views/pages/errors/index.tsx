import { Link } from 'masar/react'
import { useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

/** Playground only: trigger every kind of error to see how Masar shows it. */
// A plain variable, so the production build does not try to compile the broken files.
const loadBroken = (name: string) => {
  const path = `/error-test/${name}.tsx`
  return import(/* @vite-ignore */ path)
}

function Crash({ course }: { course?: { title: string } }) {
  return <p>{course!.title}</p>
}

export default function ErrorsPlayground() {
  const [crash, setCrash] = useState(false)
  const cases = [
    {
      title: 'Build error',
      body: 'A file with a syntax error. Vite cannot compile it; the overlay shows the code frame.',
      run: () => loadBroken('BrokenSyntax'),
    },
    {
      title: 'Missing package',
      body: 'An import of a package that is not installed. The hint says what to run.',
      run: () => loadBroken('MissingPackage'),
    },
    { title: 'Runtime error', body: 'A component reads a field of undefined while rendering.', run: () => setCrash(true) },
    {
      title: 'Unhandled promise',
      body: 'An async call fails and nobody catches it.',
      run: () => void Promise.reject(new TypeError('fetchCourses is not a function')),
    },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Error playground</h1>
        <p className="text-muted-foreground">Each button breaks something on purpose. Close the overlay with Esc.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {cases.map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle>{c.title}</CardTitle>
              <CardDescription>{c.body}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => c.run()}>
                Trigger
              </Button>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>Server error</CardTitle>
            <CardDescription>A page load() throws a MasarError with a hint.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href="/errors/server">Open</a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Not found</CardTitle>
            <CardDescription>A URL no page answers.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/no-such-page">Open</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      {crash && <Crash />}
    </div>
  )
}
