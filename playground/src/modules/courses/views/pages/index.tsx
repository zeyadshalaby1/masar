import type { LoadContext } from '@masar/core'
import { Link, router, useAction, useT, type PageProps } from '@masar/core/react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { createCourse, deleteCourse, listCourses } from '../../actions'
import { CourseForm } from '../components/CourseForm'

// Title and description for search engines and link previews.
export const meta = (_props: unknown, t: (key: string) => string) => ({ title: t('Courses') })

/** Runs on the server before the page renders. Masar removes it from the browser bundle. */
export async function load({ query }: LoadContext) {
  const search = query.get('q') ?? ''
  return {
    courses: await listCourses({ page: Number(query.get('page') ?? 1), search: search || undefined }),
    search,
  }
}

export default function CoursesIndex({ courses, search }: PageProps<typeof load>) {
  const t = useT()
  // In the browser, actions become typed calls to the server.
  const create = useAction(createCourse, { reload: true })
  const remove = useAction(deleteCourse, { reload: true })
  const link = (page: number) => ({ page: String(page), ...(search ? { q: search } : {}) })

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('Courses')}</h1>
          <p className="text-sm text-muted-foreground">{t('{count} in total', { count: courses.total })}</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const q = String(new FormData(event.currentTarget).get('q') ?? '')
            router.get('/courses', q ? { q } : {}, { preserveState: true })
          }}
        >
          <Input name="q" defaultValue={search} placeholder={t('Search by title')} className="w-56" />
          <Button type="submit" variant="outline">
            {t('Search')}
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('New course')}</CardTitle>
          <CardDescription>{t('Saved through the createCourse action, validated on the server.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <CourseForm
            submitLabel={t('Create')}
            pending={create.pending}
            errors={create.errors}
            error={create.error}
            onSubmit={create.run}
            resetOnSuccess
          />
        </CardContent>
      </Card>

      <ul className="divide-y rounded-xl border bg-card">
        {courses.data.length === 0 && (
          <li className="p-6 text-sm text-muted-foreground">{search ? t('Nothing matches your search.') : t('Nothing here yet.')}</li>
        )}
        {courses.data.map((course) => (
          <li key={course.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <Link href={`/courses/${course.id}`} className="font-medium hover:underline">
                {course.title}
              </Link>
              {course.description && (
                <p className="truncate text-sm text-muted-foreground">{course.description}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.pending}
              onClick={() => remove.run({ id: course.id })}
            >
              {t('Delete')}
            </Button>
          </li>
        ))}
      </ul>

      {courses.pages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {courses.page} of {courses.pages}
          </span>
          <div className="flex gap-2">
            {courses.page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/courses" data={link(courses.page - 1)}>{t('Previous')}</Link>
              </Button>
            )}
            {courses.page < courses.pages && (
              <Button asChild variant="outline" size="sm">
                <Link href="/courses" data={link(courses.page + 1)}>{t('Next')}</Link>
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
