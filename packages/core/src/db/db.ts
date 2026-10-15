import { MasarError } from '../errors'
import { isModel, type Model, type Shape } from './model'
import { Table } from './query'

/**
 * Query a model on the connection of the module that owns it:
 *
 *   await db(courses).where({ published: true }).latest().all()
 *   await db(courses).create({ title: 'Intro to Masar' })
 */
export function db<S extends Shape, T extends string>(model: Model<S, T>): Table<S, T> {
  if (!isModel(model)) {
    throw new MasarError('db() expects a model', {
      hint: 'Import the model from your module schema.ts, e.g. import { courses } from "./schema".',
    })
  }
  return new Table(model)
}
