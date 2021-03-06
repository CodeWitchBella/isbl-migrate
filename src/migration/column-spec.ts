import { notNull } from '@codewitchbella/ts-utils'
import snakeCase from 'lodash/snakeCase.js'
import {
  converterDefinition,
  ConverterDefinition,
} from './converter-definition'

function quoteValue(value: string | boolean | number) {
  if (typeof value === 'number') {
    // TODO: figure out if other values make sense. For now this is here to serve
    // as a sanity check
    if (Number.isSafeInteger(value)) return `${value}`
    if (!Number.isFinite(value)) throw new Error('cannot deal with infinities')
    const str = value.toFixed(4)
    if (Number.parseFloat(str) !== value)
      throw new Error('Cannot safely convert this')
    return str
  }
  if (typeof value === 'boolean') return `${value}`
  if (value.includes("'")) throw new Error("Cannot serialize string with '")
  return `'${value}'`
}

const defaultSpecVal = {
  nullable: false,
  name: null as string | null,
  references: null as string | null,
  type: null as string | null,
  default: null as string | null | boolean | number,
  unique: false,
  comment: null as string | null,
}
type SpecVal = typeof defaultSpecVal
export default class ColumnSpec {
  private spec: SpecVal
  private stack?: string
  constructor(stack?: string, spec?: SpecVal) {
    this.stack = stack
    this.spec = spec || defaultSpecVal
  }

  private h = (o: Partial<SpecVal>) =>
    new ColumnSpec(this.stack, { ...this.spec, ...o })

  name = (name: string) => this.h({ name: snakeCase(name) })
  nullable = () => this.h({ nullable: true })
  references = (table: string) => this.h({ references: table })
  type = (name: string) => this.h({ type: name })
  default = (value: string | boolean | number) => this.h({ default: value })
  unique = () => this.h({ unique: true })
  comment = (value: string) => this.h({ comment: value })
  converter = (definition: ConverterDefinition) =>
    this.comment(converterDefinition(definition))

  Error(msg: string) {
    const err = new Error(msg)
    // this is magic to reconstruct more helpfull stack trace
    // we use header from err, first line references throw location
    // rest references caller
    // If we did not do this the stacktrace would be much less specific
    if (this.stack && err.stack) {
      const parts = err.stack.split('\n')
      err.stack = [parts[0], parts[2], ...this.stack.split('\n').slice(2)].join(
        '\n',
      )
    }
    return err
  }

  serialize() {
    const c = { ...this.spec }
    if (!c.name) throw this.Error('Table name not specified')
    if (c.references && c.type)
      throw this.Error('Cannot specify both references and type')
    if (!c.type) {
      if (!c.references)
        throw this.Error('Column type nor referenced table not specified')
    }

    return [
      `"${c.name}"`,
      c.type,
      c.references ? `integer references "${c.references}" (id)` : null,
      c.nullable ? null : 'not null',
      c.unique ? 'unique' : null,
      c.default !== null ? `default ${quoteValue(c.default)}` : null,
    ]
      .filter(notNull)
      .join(' ')
  }

  getName() {
    return this.spec.name
  }

  getComment() {
    return this.spec.comment
  }
}
