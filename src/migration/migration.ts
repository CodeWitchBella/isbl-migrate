import { source } from 'common-tags'
import ColumnSpec from './column-spec'

type Specifier = ReturnType<typeof createSpecifier>['specifier']
type MigrationSpecification = (t: Specifier) => void

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

type Columns = (c: (name: string) => ColumnSpec) => ColumnSpec[]
function createTable(name: string, columns: Columns) {
  const colStrings = orArray(columns(spec)).map(c => c.serialize())

  const c = ['id serial primary key', ...colStrings].join(`,\n`)

  return {
    up: source`
      create table ${name} (
        ${c}
      );
    `,
    down: `drop table ${name};`,
  }
}

function alterTable(name: string, list: { up: string; down: string }[]) {
  const ret = {
    addColumn: (column: (c: (name: string) => ColumnSpec) => ColumnSpec) => {
      const col = column(spec)
      list.push({
        up: `alter table ${name} add column ${col.serialize()};`,
        down: `alter table ${name} drop column ${col.getName()};`,
      })
      return ret
    },
    dropColumn: (column: (c: (name: string) => ColumnSpec) => ColumnSpec) => {
      const col = column(spec)
      list.push({
        up: `alter table ${name} drop column ${col.getName()};`,
        down: `alter table ${name} add column ${col.serialize()};`,
      })
      return ret
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

export function migration(specification: MigrationSpecification) {
  const { list, specifier, description } = createSpecifier()
  specification(specifier)
  return {
    description: description.value || 'No description specified',
    up: list.map(v => v.up).join('\n'),
    down: list
      .map(v => v.down)
      .reverse()
      .join('\n'),
  }
}
