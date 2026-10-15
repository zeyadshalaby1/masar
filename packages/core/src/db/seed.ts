import { createFake, type Fake } from './fake'

export interface SeedContext {
  /** Test data: fake.name('ar'), fake.email(), fake.title(), fake.past(30), fake.many(20, ...) */
  fake: Fake
  /** Write a line to the terminal. */
  log(message: string): void
}

export interface SeedDefinition {
  readonly __masar: 'seed'
  run(context: SeedContext): Promise<void> | void
}

/**
 * Test data for a module, in src/modules/<module>/seeds.ts. `masar db:seed` runs every module's
 * seeds (modules listed in `depends` first); `--fresh` empties the tables before.
 *
 *   export default defineSeed(async ({ fake }) => {
 *     await db(courses).createMany(fake.many(20, () => ({ title: fake.title('ar') })))
 *   })
 */
export function defineSeed(run: SeedDefinition['run']): SeedDefinition {
  return { __masar: 'seed', run }
}

export function isSeed(value: unknown): value is SeedDefinition {
  return typeof value === 'object' && value !== null && (value as SeedDefinition).__masar === 'seed'
}

export { createFake, type Fake }
