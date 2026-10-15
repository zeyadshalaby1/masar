import { defineResource, users } from '@zeyadshalaby1/masar'

export default defineResource(users, {
  icon: 'users',
  columns: ['name', 'email', 'role', 'createdAt'],
  fields: {
    role: { input: 'select', options: ['user', 'admin'] },
  },
})
