import { f, model } from 'masar'

export const banners = model('banners', {
  title: f.string(),
  subtitle: f.text().optional(),
  image: f.file({ accept: ['image/*'], maxSize: '5mb' }),
  link: f.string().optional(),
  placement: f.enum(['home', 'courses', 'checkout']).default('home'),
  active: f.boolean().default(true),
  position: f.int().default(0),
  startsAt: f.date().optional(),
  endsAt: f.date().optional(),
})
