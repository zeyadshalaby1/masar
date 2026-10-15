import { MasarError } from '../errors'
import type { FileRules, StoredFile } from '../storage'

export type FieldKind = 'string' | 'text' | 'number' | 'int' | 'boolean' | 'json' | 'date' | 'ref'

export interface FieldMeta {
  optional?: boolean
  default?: unknown
  unique?: boolean
  index?: boolean
  /** Table name of the referenced model, for f.ref(). */
  ref?: string
  /** Allowed values, for f.enum(). */
  values?: readonly string[]
  /** Upload rules, for f.file() / f.files(). */
  file?: FileRules & { many?: boolean }
}

/**
 * A column definition. The type parameters carry the TypeScript type (T),
 * whether the field is optional (O) and whether it has a default (D), so
 * Row and Insert types are inferred from the schema without codegen.
 */
export class Field<T, O extends boolean = false, D extends boolean = false, R extends string = never> {
  declare readonly _type: T
  declare readonly _optional: O
  declare readonly _default: D
  /** Table this field references (f.ref), used to type eager loading. */
  declare readonly _ref: R
  readonly kind: FieldKind
  readonly meta: FieldMeta

  constructor(kind: FieldKind, meta: FieldMeta = {}) {
    this.kind = kind
    this.meta = meta
  }

  /** Allow null and make it optional when creating rows. */
  optional(): Field<T, true, D, R> {
    return new Field(this.kind, { ...this.meta, optional: true }) as Field<T, true, D, R>
  }

  /** Value used when a row is created without this field. */
  default(value: T | (() => T)): Field<T, O, true, R> {
    return new Field(this.kind, { ...this.meta, default: value }) as Field<T, O, true, R>
  }

  unique(): Field<T, O, D, R> {
    return new Field(this.kind, { ...this.meta, unique: true }) as Field<T, O, D, R>
  }

  index(): Field<T, O, D, R> {
    return new Field(this.kind, { ...this.meta, index: true }) as Field<T, O, D, R>
  }
}

/** Field builders. Every model also gets `id`, `createdAt` and `updatedAt`. */
export const f = {
  /** Short text (names, titles, slugs). */
  string: () => new Field<string>('string'),
  /** Long text. */
  text: () => new Field<string>('text'),
  /** Floating point number. */
  number: () => new Field<number>('number'),
  /** Whole number. */
  int: () => new Field<number>('int'),
  boolean: () => new Field<boolean>('boolean'),
  /** Any JSON value. Pass a type: f.json<{ tags: string[] }>() */
  json: <T = unknown>() => new Field<T>('json'),
  /** Date/time stored and returned as an ISO-8601 string. */
  date: () => new Field<string>('date'),
  /** One of a fixed set of strings: f.enum(['draft', 'published']) */
  enum: <const V extends readonly string[]>(values: V) => new Field<V[number]>('string', { values }),
  /**
   * An uploaded file (stored as JSON: disk, path, name, size, type, url). Rules are enforced
   * on the server before the upload starts:  cover: f.file({ accept: ['image/*'], maxSize: '5mb' })
   */
  file: (rules: FileRules = {}) => new Field<StoredFile>('json', { file: rules }),
  /** Several files, e.g. a gallery. */
  files: (rules: FileRules = {}) => new Field<StoredFile[], false, true>('json', { file: { ...rules, many: true }, default: () => [] }),
  /** The id of a row in another model (indexed automatically). */
  ref: <const R extends string>(table: R) => new Field<string, false, false, R>('ref', { ref: table, index: true }),
}

export type Shape = Record<string, Field<any, boolean, boolean, any>>

type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type FieldType<F> = F extends Field<infer T, infer O, any, any> ? (O extends true ? T | null : T) : never

type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends Field<any, infer O, infer D, any> ? (O extends true ? K : D extends true ? K : never) : never
}[keyof S]

type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>

/** A row as returned by queries. */
export type Row<S extends Shape> = Simplify<
  { id: string } & { [K in keyof S]: FieldType<S[K]> } & { createdAt: string; updatedAt: string }
>

/** Data accepted by create(): required fields + optional ones. */
export type Insert<S extends Shape> = Simplify<
  { [K in RequiredKeys<S>]: FieldType<S[K]> } & { [K in OptionalKeys<S>]?: FieldType<S[K]> }
>

/** Data accepted by update(). */
export type Update<S extends Shape> = Simplify<{ [K in keyof S]?: FieldType<S[K]> }>

export interface Model<S extends Shape = Shape, T extends string = string> {
  readonly __masar: 'model'
  readonly table: T
  readonly fields: S
  /** Filled in by the kernel from the module that exports this model. */
  module?: string
  /** Connection name, from the module's `store`. */
  store?: string
}

export type ModelShape<M> = M extends Model<infer S> ? S : never
export type RowOf<M> = Row<ModelShape<M>>
export type InsertOf<M> = Insert<ModelShape<M>>

const RESERVED = new Set(['id', 'createdAt', 'updatedAt'])

/**
 * Define a model in a module's schema.ts:
 *
 *   export const courses = model('courses', {
 *     title: f.string(),
 *     published: f.boolean().default(false),
 *   })
 */
export function model<const T extends string, const S extends Shape>(table: T, fields: S): Model<S, T> {
  if (!/^[a-z][a-z0-9_]*$/.test(table)) {
    throw new MasarError(`Invalid model name "${table}"`, {
      hint: 'Use lowercase letters, numbers and underscores, starting with a letter (e.g. "courses", "blog_posts").',
    })
  }
  for (const key of Object.keys(fields)) {
    if (RESERVED.has(key)) {
      throw new MasarError(`Model "${table}" defines "${key}", which Masar adds automatically`, {
        hint: 'Remove it from the schema: every model already has id, createdAt and updatedAt.',
      })
    }
    if (!(fields[key] instanceof Field)) {
      throw new MasarError(`Field "${table}.${key}" is not a field definition`, {
        hint: 'Use a builder from `f`, e.g. f.string(), f.int(), f.boolean().',
      })
    }
  }
  return { __masar: 'model', table, fields }
}

export function isModel(value: unknown): value is Model {
  return typeof value === 'object' && value !== null && (value as Model).__masar === 'model'
}

/** Built-in columns shared by every model. */
export const systemFields = {
  id: new Field<string>('string'),
  createdAt: new Field<string>('date'),
  updatedAt: new Field<string>('date'),
} satisfies Shape

export function allFields(model: Model): Record<string, Field<any, boolean, boolean, any>> {
  return { id: systemFields.id, ...model.fields, createdAt: systemFields.createdAt, updatedAt: systemFields.updatedAt }
}
