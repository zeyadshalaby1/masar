import { db, type LoadContext } from 'masar'
import { Link, router, useAction, useT, type PageProps } from 'masar/react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { deleteCourse, getCourse, updateCourse } from '../../actions'
import { courses } from '../../schema'
import { CourseForm } from '../components/CourseForm'

// views/pages/[id].tsx answers /courses/:id
export const meta = ({ course }: PageProps<typeof load>) => ({ title: course.title, description: course.description ?? undefined })

/** Which /courses/:id pages go in sitemap.xml. Server only, like load(). */
export async function sitemap() {
  return (await db(courses).latest().limit(5000).all()).map((course) => ({ id: course.id }))
}

export async function load({ params }: LoadContext<{ id: string }>) {
  return { course: await getCourse({ id: params.id }) }
}

export default function CourseShow({ course }: PageProps<typeof load>) {
  const t = useT()
  const update = useAction(updateCourse, { reload: true })
  const remove = useAction(deleteCourse, { onSuccess: () => router.visit('/courses') })

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div className="space-y-2">
        <Link href="/courses" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('Courses')}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
        <p className="text-sm text-muted-foreground">{t('Created {date}', { date: new Date(course.createdAt).toLocaleString() })}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Edit')}</CardTitle>
        </CardHeader>
        <CardContent>
          <CourseForm
            defaultValues={course}
            submitLabel={t('Save changes')}
            pending={update.pending}
            errors={update.errors}
            error={update.error}
            onSubmit={(values) => update.run({ id: course.id, ...values })}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-destructive/30 p-4">
        <p className="text-sm">{t('Delete this course permanently.')}</p>
        <Button variant="destructive" size="sm" disabled={remove.pending} onClick={() => remove.run({ id: course.id })}>
          {t('Delete')}
        </Button>
      </div>
    </div>
  )
}
