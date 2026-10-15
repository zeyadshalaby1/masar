/**
 * The admin UI. Pages of src/modules/admin re-export these; custom admin pages build on AdminPage,
 * StatCard, Chart, ResourceTable and the kit. Styled with Tailwind and the app's theme tokens.
 */
export { Chart, DashboardPage, StatCard } from './dashboard'
export { ResourceForm, ResourceRecordPage } from './form'
export { FieldInput, FilePreview, renderMarkdown } from './inputs'
export { adminCall, Badge, Button, Card, cx, Icon, Skeleton, Spinner, TextArea, TextInput, useAdmin, useAdminData, useAdminT, useConfirm, useFormat, useToast } from './kit'
export { AdminLayout, AdminPage } from './layout'
export { ResourceIndexPage, ResourceTable } from './table'
export type { AdminPageMeta } from '../define'
export type { AdminField, AdminResource, AdminRow, AdminShared } from '../types'
