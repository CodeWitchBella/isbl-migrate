import { notNull } from '@codewitchbella/ts-utils'

function quoteValue(value: string | boolean) {
  if (typeof value === 'boolean') return '' + value
  return `'${value}'`
}

const defaultSpecVal = {
  nullable: false,
  name: null as string | null,
  references: null as string | null,
  type: null as string | null,
  default: null as string | null | boolean,
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

  name = (name: string) => this.h({ name })
  nullable = () => this.h({ nullable: true })
  references = (table: string) => this.h({ references: table })
  type = (name: string) => this.h({ type: name })
  default = (value: string | boolean) => this.h({ default: value })

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
      c.default !== null ? `default ${quoteValue(c.default)}` : null,
    ]
      .filter(notNull)
      .join(' ')
  }

  getName() {
    return this.spec.name
  }
}
