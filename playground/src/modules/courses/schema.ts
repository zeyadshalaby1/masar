import { f, model } from '@masar/core'

/**
 * Every model gets id, createdAt and updatedAt automatically.
 * Change fields here: `masar dev` adds new tables, columns and indexes for you.
 */
export const courses = model('courses', {
  title: f.string(),
  description: f.text().optional(),
  cover: f.file({ accept: ['image/*'], maxSize: '2mb' }).optional(),
})
