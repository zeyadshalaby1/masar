import { defineResource } from '@zeyadshalaby1/masar'
import { courses } from '../../courses/schema'

export default defineResource(courses, {
  icon: 'book-open',
  columns: ['cover', 'title', 'createdAt'],
  fields: { description: { input: 'markdown' } },
})
