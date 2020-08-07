import { source } from 'common-tags'
import ColumnSpec from './column-spec'
import {
  ConverterDefinition,
  converterDefinition,
} from './converter-definition'

type Specifier = ReturnType<typeof createSpecifier>['specifier']
type MigrationSpecification = (t: Specifier) => void | Promise<void>

const env = process.env.NODE_ENV
function spec(name: string) {
  return new ColumnSpec(
    // disable stacktrace mangling in production
    env === 'production' ? undefined : new Error().stack,
  ).name(name)
}

function orArray<T>(v: T | T[]) {
  if (Array.isArray(v)) return v
  return [v]
}

function commentQuery(table: string, column: string, comment: string | null) {
  const start = `comment on column "${table}"."${column}"`
  if (!comment) return `${start} is NULL;`
  for (let i = 0; ; i++) {
    if (!comment.includes('token' + i))
      return `${start} is $token${i}$${comment}$token${i}$;`
  }
}

type Columns = (c: (name: string) => ColumnSpec) => ColumnSpec[]
function createTable(name: string, columns: Columns) {
  const colDefs = orArray(columns(spec))
  const colStrings = colDefs.map((c) => c.serialize())

  const c = ['id serial primary key', ...colStrings].join(`,\n`)

  return {
    up: source`
      create table "${name}" (
        ${c}
      );
      ${colDefs
        .map((c) => [c.getComment(), c.getName()])
        .filter(([comment]) => !!comment)
        .map(([comment, column]) => commentQuery(name, `${column}`, comment))}
    `,
    down: `drop table "${name}";`,
  }
}

function alterTable(name: string, list: { up: string; down: string }[]) {
  const ret = {
    addColumn: (column: (c: (name: string) => ColumnSpec) => ColumnSpec) => {
      const col = column(spec)
      list.push({
        up: `alter table "${name}" add column ${col.serialize()};`,
        down: `alter table "${name}" drop column ${col.getName()};`,
      })
      const comment = col.getComment()
      if (comment) {
        list.push({
          up: commentQuery(name, `${col.getName()}`, comment),
          down: '',
        })
      }
      return ret
    },
    dropColumn: (column: (c: (name: string) => ColumnSpec) => ColumnSpec) => {
      const col = column(spec)
      list.push({
        up: `alter table "${name}" drop column ${col.getName()};`,
        down: `alter table "${name}" add column ${col.serialize()};`,
      })
      return ret
    },
    alterColumn: (column: string) => {
      const setComment = (value: string | null, previous: string | null) => {
        list.push({
          up: commentQuery(name, column, value),
          down: commentQuery(name, column, previous),
        })
      }
      const setConverter = (
        definition: ConverterDefinition | null,
        prev: ConverterDefinition | null,
      ) => {
        setComment(
          definition !== null ? converterDefinition(definition) : null,
          prev !== null ? converterDefinition(prev) : null,
        )
      }
      return { setComment, setConverter }
    },
  }
  return ret
}

function createSpecifier() {
  const list = [] as { up: string; down: string }[]
  let desc = { value: null as string | null }

  const specifier = {
    description: (description: string) => {
      if (desc.value !== null)
        throw new Error('Cannot specify multiple descriptions')
      desc.value = description
    },
    createTable: (name: string, columns: Columns) =>
      void list.push(createTable(name, columns)),
    dropTable: (name: string, columns: Columns) => {
      const v = createTable(name, columns)
      // inverse of createTable
      list.push({ up: v.down, down: v.up })
    },
    alterTable: (name: string) => alterTable(name, list),
    raw: (migration: { up: string; down: string }) => void list.push(migration),
  }

  return {
    list,
    specifier,
    description: desc,
  }
}

export async function migration(specification: MigrationSpecification) {
  const { list, specifier, description } = createSpecifier()
  await specification(specifier)
  return {
    description: description.value || 'No description specified',
    up: list.map((v) => v.up).join('\n'),
    down: list
      .map((v) => v.down)
      .reverse()
      .join('\n'),
  }
}
