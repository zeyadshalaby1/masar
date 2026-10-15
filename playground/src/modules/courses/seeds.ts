import { db, defineSeed } from '@masar/core'
import { courses } from './schema'

export default defineSeed(async ({ fake }) => {
  await db(courses).createMany(
    fake.many(20, () => ({
      title: fake.title(fake.boolean() ? 'ar' : 'en'),
      description: fake.boolean(0.7) ? fake.paragraph(2) : null,
    })),
  )
})
