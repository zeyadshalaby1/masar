import { defineModule } from '@zeyadshalaby1/masar'

export default defineModule({
  name: 'courses',
  title: 'Courses',
  expose: { ui: true, api: true },
  // store: 'main',        // database connection from src/config/database.ts
  // depends: ['users'],    // modules this one needs
})
