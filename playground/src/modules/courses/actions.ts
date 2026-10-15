import { action, db, t, uploaded, z } from 'masar'
import { courses } from './schema'

const courseInput = z.object({
  title: z.string().trim().min(2, { error: () => t('Title is too short') }).max(200),
  description: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => value || null),
  cover: uploaded().nullish(),
})

// Signed-in users only. Narrow any action with role('admin'), e.g. for delete.
export const listCourses = action({
  authorize: 'user',
  input: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      search: z.string().trim().optional(),
    })
    .optional(),
  run: ({ input }) =>
    db(courses)
      .where(input?.search ? { title: { contains: input.search } } : {})
      .latest()
      .paginate(input?.page ?? 1, 20),
})

export const getCourse = action({
  authorize: 'user',
  input: z.object({ id: z.string() }),
  run: ({ input }) => db(courses).findOrFail(input.id),
})

export const createCourse = action({
  authorize: 'user',
  input: courseInput,
  run: ({ input }) => db(courses).create(input),
})

export const updateCourse = action({
  authorize: 'user',
  input: courseInput.extend({ id: z.string() }),
  run: ({ input: { id, ...data } }) => db(courses).update(id, data),
})

export const deleteCourse = action({
  authorize: 'user',
  input: z.object({ id: z.string() }),
  run: ({ input }) => db(courses).delete(input.id),
})
