import { defineResource, users } from '@masar/core'

export default defineResource(users, {
  icon: 'users',
  columns: ['name', 'email', 'role', 'createdAt'],
  fields: {
    role: { input: 'select', options: ['user', 'admin'] },
  },
})
