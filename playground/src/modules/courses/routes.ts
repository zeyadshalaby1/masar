import { defineRoutes } from '@zeyadshalaby1/masar'
import { listCourses } from './actions'

/**
 * Extra HTTP routes (webhooks, downloads, custom endpoints).
 * Paths are relative to this module's prefix. Pages and actions are wired
 * automatically and don't need entries here.
 */
export default defineRoutes((r) => {
  // GET /courses/export.json
  r.get('/export.json', async (c) => c.json(await listCourses()))
})
