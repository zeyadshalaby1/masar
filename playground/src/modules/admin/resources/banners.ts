import { defineResource } from 'masar'
import { banners } from '../../banners/schema'

export default defineResource(banners, {
  icon: 'image',
  group: 'Marketing',
  columns: ['image', 'title', 'placement', 'active', 'position'],
  sort: ['position', 'asc'],
  form: [
    { title: 'Content', fields: ['title', 'subtitle', 'image', 'link'] },
    { title: 'Display', fields: ['placement', 'active', 'position', 'startsAt', 'endsAt'] },
  ],
  fields: {
    link: { input: 'url', placeholder: 'https://…' },
    placement: { input: 'radio' },
  },
})
